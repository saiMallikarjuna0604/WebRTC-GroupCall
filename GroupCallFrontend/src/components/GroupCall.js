/* eslint-disable default-case */
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './GroupCall.css';

const GroupCall = ({ user, onLeave }) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map());
    const [isConnected, setIsConnected] = useState(false);
    const [participants, setParticipants] = useState([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [activeRoom, setActiveRoom] = useState(null);
    const [availableRooms, setAvailableRooms] = useState([]);

    const socketRef = useRef(null);
    const localVideoRef = useRef(null);

    // Basic Socket.IO connection
    useEffect(() => {
        socketRef.current = io('http://localhost:3001');
        
        socketRef.current.on('connect', () => {
            console.log('Connected to SFU server');
            setIsConnected(true);
        });

        socketRef.current.on('disconnect', () => {
            console.log('Disconnected from SFU server');
            setIsConnected(false);
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    const toggleAudio = () => {
        setIsMuted(!isMuted);
    };

    const toggleVideo = () => {
        setIsVideoOff(!isVideoOff);
    };

    const leaveRoom = () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        onLeave();
    };

    // Placeholder functions for room management
    const createRoom = () => {
        console.log('Create room clicked');
    };

    const joinRoom = (roomId) => {
        console.log('Join room clicked:', roomId);
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
                            />
                            <div className="video-label">
                                You {isMuted && '(Muted)'} {isVideoOff && '(Video Off)'}
                            </div>
                        </div>
                        {Array.from(remoteStreams).map(([streamId, { stream, userId }]) => {
                            const participant = participants.find(p => p.id === userId);
                            return (
                                <div key={streamId} className="video-container remote">
                                    <video
                                        autoPlay
                                        playsInline
                                        ref={el => {
                                            if (el) el.srcObject = stream;
                                        }}
                                    />
                                    <div className="video-label">
                                        {participant?.name || 'Unknown'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="controls">
                        <button onClick={toggleAudio}>
                            {isMuted ? 'Unmute' : 'Mute'}
                        </button>
                        <button onClick={toggleVideo}>
                            {isVideoOff ? 'Start Video' : 'Stop Video'}
                        </button>
                        <button onClick={leaveRoom} className="leave-btn">
                            Leave Room
                        </button>
                    </div>
                    <div className="participants-list">
                        <h3>Participants ({participants.length})</h3>
                        {participants.map(participant => (
                            <div key={participant.id} className="participant-item">
                                {participant.avatar && (
                                    <img 
                                        src={participant.avatar} 
                                        alt={participant.name}
                                        className="participant-avatar"
                                    />
                                )}
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