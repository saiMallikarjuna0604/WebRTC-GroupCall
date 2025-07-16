/* eslint-disable default-case */
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import './GroupCall.css';

const GroupCall = ({ user, onLeave, meetingId, socket }) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map());
    const [isConnected, setIsConnected] = useState(false);
    const [participants, setParticipants] = useState([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [activeRoom, setActiveRoom] = useState(meetingId);
    const [availableRooms, setAvailableRooms] = useState([]);

    // MediaSoup state
    const [device, setDevice] = useState(null);
    const [sendTransport, setSendTransport] = useState(null);
    const [recvTransport, setRecvTransport] = useState(null);
    const [producers, setProducers] = useState(new Map());
    const [consumers, setConsumers] = useState(new Map());
    const [routerRtpCapabilities, setRouterRtpCapabilities] = useState(null);

    const socketRef = useRef(socket);
    const localVideoRef = useRef(null);

    // Initialize Socket.IO connection and MediaSoup events
    useEffect(() => {
        if (!socketRef.current) {
            socketRef.current = io('http://localhost:3001');
        }
        
        socketRef.current.on('connect', () => {
            console.log('Connected to SFU server');
            setIsConnected(true);
            
            // Register user
            socketRef.current.emit('register', {
                email: user.email
            });
        });

        socketRef.current.on('disconnect', () => {
            console.log('Disconnected from SFU server');
            setIsConnected(false);
        });

        // MediaSoup events
        socketRef.current.on('router:rtpCapabilities', async (data) => {
            try {
                const { rtpCapabilities } = data;
                setRouterRtpCapabilities(rtpCapabilities);
                
                if (device) {
                    await device.load({ routerRtpCapabilities: rtpCapabilities });
                    console.log('Device loaded with router RTP capabilities');
                }
            } catch (error) {
                console.error('Error loading device:', error);
            }
        });

        socketRef.current.on('transport:created', async (data) => {
            try {
                const { id, iceParameters, iceCandidates, dtlsParameters, direction } = data;
                
                if (direction === 'send') {
                    const transport = device.createSendTransport({
                        id,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters
                    });
                    
                    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
                        socketRef.current.emit('transport:connect', {
                            meetingId: activeRoom,
                            transportId: transport.id,
                            dtlsParameters
                        });
                        callback();
                    });
                    
                    transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                        try {
                            socketRef.current.emit('producer:create', {
                                meetingId: activeRoom,
                                email: user.email,
                                transportId: transport.id,
                                kind,
                                rtpParameters
                            });
                        } catch (error) {
                            errback(error);
                        }
                    });
                    
                    setSendTransport(transport);
                    console.log('Send transport created');
                    
                    // Create producers if we have local stream
                    if (localStream) {
                        await createProducers(transport);
                    }
                } else {
                    const transport = device.createRecvTransport({
                        id,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters
                    });
                    
                    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
                        socketRef.current.emit('transport:connect', {
                            meetingId: activeRoom,
                            transportId: transport.id,
                            dtlsParameters
                        });
                        callback();
                    });
                    
                    setRecvTransport(transport);
                    console.log('Receive transport created');
                }
            } catch (error) {
                console.error('Error creating transport:', error);
            }
        });

        socketRef.current.on('transport:connected', (data) => {
            console.log('Transport connected:', data.transportId);
        });

        socketRef.current.on('producer:created', async (data) => {
            try {
                const { producerId, kind, email } = data;
                
                if (recvTransport && device) {
                    // Create consumer for new producer
                    const consumer = await recvTransport.consume({
                        producerId,
                        rtpCapabilities: device.rtpCapabilities,
                        paused: false
                    });
                    
                    setConsumers(prev => new Map(prev).set(producerId, consumer));
                    
                    // Add remote stream
                    const stream = new MediaStream([consumer.track]);
                    setRemoteStreams(prev => new Map(prev).set(producerId, {
                        stream,
                        userId: email,
                        kind
                    }));
                    
                    console.log('Consumer created for producer:', producerId);
                }
            } catch (error) {
                console.error('Error creating consumer:', error);
            }
        });

        socketRef.current.on('consumer:created', (data) => {
            console.log('Consumer created:', data);
        });

        socketRef.current.on('participant:joined', (data) => {
            console.log('Participant joined:', data);
            setParticipants(prev => [...prev, { id: data.email, name: data.email }]);
        });

        socketRef.current.on('participant:left', (data) => {
            console.log('Participant left:', data);
            setParticipants(prev => prev.filter(p => p.id !== data.email));
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [device, activeRoom, user.email]);

    // Create MediaSoup device when router capabilities are available
    useEffect(() => {
        if (routerRtpCapabilities && !device) {
            const newDevice = new Device();
            setDevice(newDevice);
        }
    }, [routerRtpCapabilities, device]);

    // Get router RTP capabilities when room is active
    useEffect(() => {
        if (activeRoom && socketRef.current) {
            socketRef.current.emit('router:rtpCapabilities', { meetingId: activeRoom });
        }
    }, [activeRoom]);

    // Create producers when send transport is ready
    const createProducers = async (transport) => {
        try {
            if (!localStream) return;

            // Create audio producer
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                const audioProducer = await transport.produce({ track: audioTrack });
                setProducers(prev => new Map(prev).set('audio', audioProducer));
                console.log('Audio producer created');
            }

            // Create video producer
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                const videoProducer = await transport.produce({ track: videoTrack });
                setProducers(prev => new Map(prev).set('video', videoProducer));
                console.log('Video producer created');
            }
        } catch (error) {
            console.error('Error creating producers:', error);
        }
    };

    // Create transports when device is ready
    useEffect(() => {
        if (device && activeRoom && !sendTransport && !recvTransport) {
            // Create send transport
            socketRef.current.emit('transport:create', {
                meetingId: activeRoom,
                direction: 'send',
                email: user.email
            });

            // Create receive transport
            socketRef.current.emit('transport:create', {
                meetingId: activeRoom,
                direction: 'recv',
                email: user.email
            });
        }
    }, [device, activeRoom, sendTransport, recvTransport, user.email]);

    const createRoom = async () => {
        try {
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            setLocalStream(stream);
            
            // Create meeting via backend
            const response = await fetch('http://localhost:3001/api/meetings/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hostEmail: user.email,
                    participants: [],
                    title: 'New Call'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                setActiveRoom(result.meeting.meetingId);
            }
        } catch (error) {
            console.error('Error creating room:', error);
        }
    };

    const joinRoom = async (roomId) => {
        try {
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            setLocalStream(stream);
            
            setActiveRoom(roomId);
            
            // Join meeting via API
            await fetch(`http://localhost:3001/api/meetings/${roomId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'join',
                    participantEmail: user.email
                })
            });
        } catch (error) {
            console.error('Error joining room:', error);
        }
    };

    const toggleAudio = async () => {
        try {
            const audioProducer = producers.get('audio');
            if (audioProducer) {
                if (isMuted) {
                    await audioProducer.resume();
                } else {
                    await audioProducer.pause();
                }
            }
            setIsMuted(!isMuted);
        } catch (error) {
            console.error('Error toggling audio:', error);
        }
    };

    const toggleVideo = async () => {
        try {
            const videoProducer = producers.get('video');
            if (videoProducer) {
                if (isVideoOff) {
                    await videoProducer.resume();
                } else {
                    await videoProducer.pause();
                }
            }
            setIsVideoOff(!isVideoOff);
        } catch (error) {
            console.error('Error toggling video:', error);
        }
    };

    const leaveRoom = async () => {
        try {
            // Close all producers
            for (const producer of producers.values()) {
                producer.close();
            }
            
            // Close all consumers
            for (const consumer of consumers.values()) {
                consumer.close();
            }
            
            // Close transports
            if (sendTransport) sendTransport.close();
            if (recvTransport) recvTransport.close();
            
            // Stop local stream
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            
            // Leave meeting via API
            if (activeRoom) {
                await fetch(`http://localhost:3001/api/meetings/${activeRoom}/action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'leave',
                        participantEmail: user.email
                    })
                });
            }
            
            // Reset state
            setLocalStream(null);
            setRemoteStreams(new Map());
            setProducers(new Map());
            setConsumers(new Map());
            setSendTransport(null);
            setRecvTransport(null);
            setDevice(null);
            setActiveRoom(null);
            
            onLeave();
        } catch (error) {
            console.error('Error leaving room:', error);
            onLeave();
        }
    };

    const endCall = async () => {
        try {
            // Close all producers
            for (const producer of producers.values()) {
                producer.close();
            }
            
            // Close all consumers
            for (const consumer of consumers.values()) {
                consumer.close();
            }
            
            // Close transports
            if (sendTransport) sendTransport.close();
            if (recvTransport) recvTransport.close();
            
            // Stop local stream
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            
            // End call for all participants via socket
            if (activeRoom && socketRef.current) {
                socketRef.current.emit('call:end', {
                    meetingId: activeRoom,
                    hostEmail: user.email
                });
            }
            
            // Reset state
            setLocalStream(null);
            setRemoteStreams(new Map());
            setProducers(new Map());
            setConsumers(new Map());
            setSendTransport(null);
            setRecvTransport(null);
            setDevice(null);
            setActiveRoom(null);
            
            onLeave();
        } catch (error) {
            console.error('Error ending call:', error);
            onLeave();
        }
    };

    return (
        <div className="group-call-container">
            {!activeRoom ? (
                <div className="room-selection">
                    <h2>Available Rooms</h2>
                    <button onClick={createRoom}>Create New Room</button>
                    <div className="room-list">
                        {availableRooms.map(room => (
                            <div key={room.roomId} className="room-item">
                                <span>Room {room.roomId}</span>
                                <span>{room.participantCount} participants</span>
                                <button onClick={() => joinRoom(room.roomId)}>
                                    Join
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="video-grid">
                        <div className="video-container local">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ display: isVideoOff ? 'none' : 'block' }}
                            />
                            {isVideoOff && (
                                <div className="video-placeholder">
                                    <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
                                </div>
                            )}
                            <div className="video-label">
                                You {isMuted && '(Muted)'} {isVideoOff && '(Video Off)'}
                            </div>
                        </div>
                        {Array.from(remoteStreams).map(([streamId, { stream, userId, kind }]) => {
                            const participant = participants.find(p => p.id === userId);
                            return (
                                <div key={streamId} className="video-container remote">
                                    <video
                                        autoPlay
                                        playsInline
                                        ref={el => {
                                            if (el) el.srcObject = stream;
                                        }}
                                        style={{ display: kind === 'video' ? 'block' : 'none' }}
                                    />
                                    {kind === 'audio' && (
                                        <div className="audio-only">
                                            <div className="avatar">{userId.charAt(0).toUpperCase()}</div>
                                        </div>
                                    )}
                                    <div className="video-label">
                                        {participant?.name || userId}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="controls">
                        <button onClick={toggleAudio} className={isMuted ? 'muted' : ''}>
                            {isMuted ? '🔇 Unmute' : '🎤 Mute'}
                        </button>
                        <button onClick={toggleVideo} className={isVideoOff ? 'video-off' : ''}>
                            {isVideoOff ? '📹 Start Video' : '📷 Stop Video'}
                        </button>
                        <button onClick={leaveRoom} className="leave-btn">
                            ❌ Leave Room
                        </button>
                        <button onClick={endCall} className="end-call-btn">
                            🚫 End Call
                        </button>
                    </div>
                    <div className="participants-list">
                        <h3>Participants ({participants.length + 1})</h3>
                        <div className="participant-item">
                            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
                            <span>{user.name} (You)</span>
                        </div>
                        {participants.map(participant => (
                            <div key={participant.id} className="participant-item">
                                <div className="avatar">{participant.name.charAt(0).toUpperCase()}</div>
                                <span>{participant.name}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default GroupCall; 