import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import SimplePeer from 'simple-peer';
import jwtDecode from 'jwt-decode';

const socket = io('http://localhost:5000');

const App = () => {
  const [stream, setStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [myPeerId, setMyPeerId] = useState(null);
  const videoRef = useRef();

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setStream(stream);
        videoRef.current.srcObject = stream;
      });

    socket.on('user-joined', (peerId) => {
      // Handle new peer joining
    });

    socket.on('user-left', (peerId) => {
      // Handle user leaving the call
    });
  }, []);

  const startCall = (roomId) => {
    socket.emit('join-call', roomId);

    // WebRTC signaling setup
  };

  const stopCall = () => {
    // Logic to end the call
  };

  return (
    <div>
      <video ref={videoRef} autoPlay muted />
      <button onClick={() => startCall('room1')}>Start Call</button>
      <button onClick={stopCall}>End Call</button>
    </div>
  );
};

export default App;