/* eslint-disable default-case */
import React, { useEffect, useRef, useState } from 'react';
import { Device } from 'mediasoup-client';
import './GroupCall.css';

const GroupCall = ({ user, onLeave, meetingId, socket, isHost = false }) => {
    // Only essential UI states - no socket-driven states
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map()); // userId -> { audioTrack, videoTrack, stream }
    const [participants, setParticipants] = useState([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [error, setError] = useState(null);

    console.log(remoteStreams)
    console.log(localStream,'localStream')

    // MediaSoup objects (not state-driven)
    const deviceRef = useRef(null);
    const sendTransportRef = useRef(null);
    const recvTransportRef = useRef(null);
    const producersRef = useRef(new Map());
    const consumersRef = useRef(new Map());
    const localVideoRef = useRef(null);
    const isCleaningUpRef = useRef(false);
    const hasStartedCallRef = useRef(false);
    const eventListenersAddedRef = useRef(false);

    // Add transport creation with retry
    const createTransportWithRetry = async (direction, retryCount = 3, delay = 2000) => {
        for (let i = 0; i < retryCount; i++) {
            try {
                const transportData = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Transport creation timeout')), 10000);
                    
                    socket.emit('transport:create', {
                        meetingId,
                        direction,
                        email: user.email
                    });
                    
                    socket.once('transport:created', (data) => {
                        clearTimeout(timeout);
                        resolve(data);
                    });
                    
                    socket.once('error', (error) => {
                        clearTimeout(timeout);
                        reject(new Error(error.message || `Failed to create ${direction} transport`));
                    });
                });
                return transportData;
            } catch (error) {
                if (i === retryCount - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, delay));
                console.log(`Retrying ${direction} transport creation, attempt ${i + 2}/${retryCount}`);
            }
        }
    };

    // Sequential call process function with step tracking
    const joinCallProcess = async () => {
        // Prevent duplicate call processes
        if (hasStartedCallRef.current) {
            console.log('Call process already started, skipping...');
            return;
        }
        
        hasStartedCallRef.current = true;
        
        try {
            setError(null);
            
            // Step 1: Get user media
            console.log('Step 1: Getting user media...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            setLocalStream(stream);
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.muted = true;
                localVideoRef.current.play().catch(e => console.log('Local video play failed:', e));
            }
            
            // Step 2: Get Router RTP Capabilities
            console.log('Step 2: Getting router RTP capabilities...');
            const rtpCapabilities = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('RTP capabilities timeout')), 10000);
                
                socket.emit('router:rtpCapabilities', { meetingId });
                
                socket.once('router:rtpCapabilities', (data) => {
                    clearTimeout(timeout);
                    resolve(data.rtpCapabilities);
                });
                
                socket.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error(error.message || 'Failed to get RTP capabilities'));
                });
            });
            
            // Step 3: Create MediaSoup Device
            console.log('Step 3: Creating MediaSoup device...');
            const device = new Device();
            await device.load({ routerRtpCapabilities: rtpCapabilities });
            deviceRef.current = device;
            
            // Step 4: Create Send Transport with retry
            console.log('Step 4: Creating send transport...');
            const sendTransportData = await createTransportWithRetry('send');
            
            // Step 5: Create Send Transport Object
            console.log('Step 5: Creating send transport object...');
            const sendTransport = device.createSendTransport({
                id: sendTransportData.id,
                iceParameters: sendTransportData.iceParameters,
                iceCandidates: sendTransportData.iceCandidates,
                dtlsParameters: sendTransportData.dtlsParameters
            });
            
            sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('transport:connect', {
                    meetingId,
                    transportId: sendTransport.id,
                    dtlsParameters
                });
                callback();
            });
            
            sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                try {
                    const result = await new Promise((resolve, reject) => {
                        socket.emit('producer:create', {
                            meetingId,
                            email: user.email,
                            transportId: sendTransport.id,
                            kind,
                            rtpParameters
                        });
                        
                        socket.once('producer:created', (data) => {
                            resolve(data);
                        });
                        
                        socket.once('error', (error) => {
                            reject(new Error(error.message || 'Failed to create producer'));
                        });
                    });
                    
                    callback({ id: result.producerId });
                } catch (error) {
                    errback(error);
                }
            });
            
            sendTransportRef.current = sendTransport;
            
            // Step 6: Create Receive Transport with retry
            console.log('Step 6: Creating receive transport...');
            const recvTransportData = await createTransportWithRetry('recv');
            
            // Step 7: Create Receive Transport Object
            console.log('Step 7: Creating receive transport object...');
            const recvTransport = device.createRecvTransport({
                id: recvTransportData.id,
                iceParameters: recvTransportData.iceParameters,
                iceCandidates: recvTransportData.iceCandidates,
                dtlsParameters: recvTransportData.dtlsParameters
            });
            
            recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                socket.emit('transport:connect', {
                    meetingId,
                    transportId: recvTransport.id,
                    dtlsParameters
                });
                callback();
            });
            
            recvTransportRef.current = recvTransport;
            
            // Step 8: Create Producers
            console.log('Step 8: Creating producers...');
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                const audioProducer = await sendTransport.produce({ track: audioTrack });
                producersRef.current.set('audio', audioProducer);
            }
            
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                const videoProducer = await sendTransport.produce({ track: videoTrack });
                producersRef.current.set('video', videoProducer);
            }

            // Signal ready to receive producers
            socket.emit('client:ready');
            
            // Step 9: Join meeting via API
            console.log('Step 9: Joining meeting via API...');
            const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'join',
                    participantEmail: user.email
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to join meeting');
            }
            
            console.log('Call process completed successfully!');
            
        } catch (error) {
            console.error('Error in call process:', error);
            
            // Cleanup resources based on refs
            if (sendTransportRef.current) {
                sendTransportRef.current.close();
                sendTransportRef.current = null;
            }
            if (recvTransportRef.current) {
                recvTransportRef.current.close();
                recvTransportRef.current = null;
            }
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            
            setError(error.message);
            hasStartedCallRef.current = false;
        }
    };

    // Add endCall function for host
    const endCall = async () => {
        try {
            // Emit end call event to server
            socket.emit('call:end', {
                meetingId,
                hostEmail: user.email
            });

            // Clean up local resources
            await cleanupCall();
            setLocalStream(null);
            setRemoteStreams(new Map());
            setParticipants([]);
            onLeave();
        } catch (error) {
            console.error('Error ending call:', error);
        }
    };

    // Setup event listeners for incoming producers
    useEffect(() => {
        if (!socket || eventListenersAddedRef.current) return;
        eventListenersAddedRef.current = true;

        const handleProducerCreated = async (data) => {
            try {
                const { producerId, kind, email } = data;
                
                console.log('Producer created event received:', { producerId, kind, email });
                console.log('Transport and device ready:', { 
                    recvTransport: !!recvTransportRef.current, 
                    device: !!deviceRef.current 
                });
                
                if (recvTransportRef.current && deviceRef.current && producerId) {
                    console.log('Requesting consumer creation for producer:', producerId);
                    // Request consumer creation from server
                    socket.emit('consumer:create', {
                        meetingId,
                        email: user.email,
                        transportId: recvTransportRef.current.id,
                        producerId,
                        rtpCapabilities: deviceRef.current.rtpCapabilities
                    });
                } else {
                    console.log('Cannot create consumer - missing requirements:', {
                        recvTransport: !!recvTransportRef.current,
                        device: !!deviceRef.current,
                        producerId: !!producerId
                    });
                }
            } catch (error) {
                console.error('Error requesting consumer creation:', error);
            }
        };

        const handleConsumerCreated = async (data) => {
            try {
                const { consumerId, producerId, kind, rtpParameters, email } = data;
                
                console.log(email,'email')
                
                // Add validation to skip own streams
                if (email === user.email) {
                    console.log('Skipping own stream');
                    return;
                }
                
                if (recvTransportRef.current) {
                    // Create consumer object from server data
                    const consumer = await recvTransportRef.current.consume({
                        id: consumerId,
                        producerId,
                        kind,
                        rtpParameters,
                        paused: false
                    });
                    
                    consumersRef.current.set(producerId, consumer);
                    
                    // Group streams by user instead of by producer
                    setRemoteStreams(prev => {
                        const newMap = new Map(prev);
                        const existingUser = newMap.get(email);
                        
                        if (existingUser) {
                            // User already exists, add the new track
                            const tracks = [consumer.track];
                            if (existingUser.audioTrack) tracks.push(existingUser.audioTrack);
                            if (existingUser.videoTrack) tracks.push(existingUser.videoTrack);
                            
                            const combinedStream = new MediaStream(tracks);
                            newMap.set(email, {
                                stream: combinedStream,
                                userId: email,
                                audioTrack: kind === 'audio' ? consumer.track : existingUser.audioTrack,
                                videoTrack: kind === 'video' ? consumer.track : existingUser.videoTrack
                            });
                        } else {
                            // New user, create initial stream
                            const stream = new MediaStream([consumer.track]);
                            newMap.set(email, {
                                stream,
                                userId: email,
                                audioTrack: kind === 'audio' ? consumer.track : null,
                                videoTrack: kind === 'video' ? consumer.track : null
                            });
                        }
                        
                        return newMap;
                    });

                    console.log('Consumer created for producer:', producerId, 'kind:', kind, 'user:', email);
                }
            } catch (error) {
                console.error('Error creating consumer from server data:', error);
            }
        };

        const handleParticipantJoined = (data) => {
            console.log('Participant joined:', data);
            setParticipants(prev => [...prev, { id: data.email, name: data.email }]);
        };

        const handleParticipantLeft = (data) => {
            console.log('Participant left:', data);
            setParticipants(prev => prev.filter(p => p.id !== data.email));
        };

        const handleCallEnded = async () => {
            // Clean up and leave for all participants
            await cleanupCall();
            setLocalStream(null);
            setRemoteStreams(new Map());
            setParticipants([]);
            onLeave();
        };

        socket.on('producer:created', handleProducerCreated);
        socket.on('consumer:created', handleConsumerCreated);
        socket.on('participant:joined', handleParticipantJoined);
        socket.on('participant:left', handleParticipantLeft);
        socket.on('call:ended', handleCallEnded);

        // Start the call process immediately when component mounts
        joinCallProcess();

        return () => {
            socket.off('producer:created', handleProducerCreated);
            socket.off('consumer:created', handleConsumerCreated);
            socket.off('participant:joined', handleParticipantJoined);
            socket.off('participant:left', handleParticipantLeft);
            socket.off('call:ended', handleCallEnded);
            eventListenersAddedRef.current = false;
        };
    }, [socket, meetingId, user.email]);

    // Cleanup function
    const cleanupCall = async () => {
        // Prevent multiple cleanup calls
        if (isCleaningUpRef.current) return;
        isCleaningUpRef.current = true;
        
        try {
            // Close all producers
            for (const producer of producersRef.current.values()) {
                producer.close();
            }
            
            // Close all consumers
            for (const consumer of consumersRef.current.values()) {
                consumer.close();
            }
            
            // Close transports
            if (sendTransportRef.current) sendTransportRef.current.close();
            if (recvTransportRef.current) recvTransportRef.current.close();
            
            // Stop local stream
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            
            // Leave meeting via API only if we have a meetingId
            if (meetingId) {
                await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'leave',
                        participantEmail: user.email
                    })
                });
            }
            
            // Reset refs
            deviceRef.current = null;
            sendTransportRef.current = null;
            recvTransportRef.current = null;
            producersRef.current.clear();
            consumersRef.current.clear();
            
        } catch (error) {
            console.error('Error cleaning up call:', error);
        } finally {
            isCleaningUpRef.current = false;
            // Reset the call flag only after cleanup is complete
            hasStartedCallRef.current = false;
        }
    };

    const toggleAudio = async () => {
        try {
            const audioProducer = producersRef.current.get('audio');
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
            const videoProducer = producersRef.current.get('video');
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

        await cleanupCall();
        setLocalStream(null);
        setRemoteStreams(new Map());
        setParticipants([]);
        onLeave();
    };

    if (error) {
        return (
            <div className="group-call">
                <div className="error-message">
                    <h3>Connection Error</h3>
                    <p>{error}</p>
                    <button onClick={leaveRoom}>Leave Call</button>
                </div>
            </div>
        );
    }

    return (
        <div className="group-call">
            <div className="call-header">
                <h2>Group Call - {meetingId}</h2>
                <div className="call-controls">
                    <button 
                        onClick={toggleAudio} 
                        className={`control-btn ${isMuted ? 'muted' : ''}`}
                    >
                        {isMuted ? '🔇' : '🔊'}
                    </button>
                    <button 
                        onClick={toggleVideo} 
                        className={`control-btn ${isVideoOff ? 'video-off' : ''}`}
                    >
                        {isVideoOff ? '📹' : '📷'}
                    </button>
                    {isHost ? (
                        <button onClick={endCall} className="control-btn end">
                            ❌ End Call
                        </button>
                    ) : (
                        <button onClick={leaveRoom} className="control-btn leave">
                            ❌ Leave
                        </button>
                    )}
                </div>
            </div>

            <div className="video-container">
                <div className="local-video">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                            />
                    <div className="video-label">You ({user.email})</div>
                            </div>
                
                                {Array.from(remoteStreams.values()).map(({ stream, userId }, index) => (
                    <div key={userId} className="remote-video">
                        <video
                            autoPlay
                            playsInline
                            ref={(el) => {
                                if (el) {
                                    el.srcObject = stream;
                                    el.play().catch(e => console.log('Remote video play failed:', e));
                                }
                            }}
                        />
                        <div className="stream-label">{userId}</div>
                    </div>
                ))}
                    </div>

                    <div className="participants-list">
                <h3>Participants ({participants.length + 1})</h3>
                <div className="participant-item">
                    <span>{user.email}</span>
                    <span className="status">You</span>
                </div>
                {participants.map((participant) => (
                            <div key={participant.id} className="participant-item">
                                <span>{participant.name}</span>
                        <span className="status">Connected</span>
                            </div>
                        ))}
                    </div>
        </div>
    );
};

export default GroupCall; 