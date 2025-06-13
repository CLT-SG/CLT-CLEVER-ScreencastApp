const socket = io('http://localhost:8840');
const peerConnection = new RTCPeerConnection();

// UI elements
const startMasterButton = document.getElementById('startMaster');
const openClientButton = document.getElementById('openClient');

// -------------------- Master Functions -------------------- 

function startMaster() {
  const constraints = {
    audio: {
      mandatory: {
        // Example: Enforce Opus if supported
        googOpusStereo: true 
      }
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
      setupAudioProcessing(stream);
      callClient();
    })
    .catch(error => console.error('Error accessing microphone:', error));
}

function setupAudioProcessing(stream) {
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  source.connect(analyser).connect(audioCtx.destination); 

  visualizeAudio(analyser);
}

function visualizeAudio(analyser) {
  const canvas = document.createElement('canvas'); 
  document.body.appendChild(canvas); 
  const canvasCtx = canvas.getContext('2d');

  analyser.fftSize = 256; 
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    requestAnimationFrame(renderFrame);
    analyser.getByteFrequencyData(dataArray);

    // Basic drawing on canvas using dataArray
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.fillStyle = 'rgb(0, 0, 0)';
    let bars = 100;
    let barWidth = (canvas.width / bars) - 1;
    let x = 0;

    for (let i = 0; i < bars; i++) {
      let barHeight = dataArray[i];

      canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);
      x += barWidth + 1;
    }
  }
  renderFrame();
}

async function callClient() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', offer);
}

// -------------------- WebRTC Signaling (Master and Client) -------------------- 
socket.on('answer', async (answer) => {
  await peerConnection.setRemoteDescription(answer);
});

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit('candidate', event.candidate);
  }
};

socket.on('candidate', async (candidate) => {
  await peerConnection.addIceCandidate(candidate);
});

// -------------------- Client Window -------------------- 
openClientButton.addEventListener('click', () => {
  const clientWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  clientWindow.loadURL(`file://${__dirname}/client.html`);
});

// -------------------- Event Listeners -------------------- 
startMasterButton.addEventListener('click', startMaster);