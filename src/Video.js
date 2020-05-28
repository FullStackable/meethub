import React, { Component } from 'react';
import io from 'socket.io-client';
import faker from "faker";

import IconButton from '@material-ui/core/IconButton';
import Badge from '@material-ui/core/Badge';
import { Input, Button } from '@material-ui/core';
import VideocamIcon from '@material-ui/icons/Videocam';
import VideocamOffIcon from '@material-ui/icons/VideocamOff';
import MicIcon from '@material-ui/icons/Mic';
import MicOffIcon from '@material-ui/icons/MicOff';
import ScreenShareIcon from '@material-ui/icons/ScreenShare';
import StopScreenShareIcon from '@material-ui/icons/StopScreenShare';
import CallEndIcon from '@material-ui/icons/CallEnd';
import ChatIcon from '@material-ui/icons/Chat';

import { message } from 'antd';
import 'antd/dist/antd.css';

import { Row } from 'reactstrap';
import Modal from 'react-bootstrap/Modal'
import 'bootstrap/dist/css/bootstrap.css';
import "./Video.css";

const server_url = process.env.NODE_ENV === 'production' ? 'https://ucf-meethub.herokuapp.com' : "http://localhost:3000"

var connections = {}
const peerConnectionConfig = {
	'iceServers': [
		// { 'urls': 'stun:stun.services.mozilla.com' },
		{ 'urls': 'stun:stun.l.google.com:19302' },
	]
}
var socket = null
var socketId = null

var elms = 0

class Video extends Component {
	constructor(props) {
		super(props)

		this.localVideoref = React.createRef()

		this.videoAvailable = false
		this.audioAvailable = false

		this.video = false
		this.audio = false
		this.screen = false

		this.state = {
			video: false,
			audio: false,
			screen: false,
			showModal: false,
			screenAvailable: false,
			messages: [],
			message: "",
			newmessages: 0,
			askForUsername: true,
			username: faker.internet.Username(),
		}
		connections = {}

		this.addMessage = this.addMessage.bind(this)

		this.getPermissions()
	}

	getPermissions = async () => {
		await navigator.mediaDevices.getUserMedia({ video: true })
			.then((stream) => {
				this.videoAvailable = true
				this.video = true
			})
			.catch((e) => {
				this.videoAvailable = false
			})

		await navigator.mediaDevices.getUserMedia({ audio: true })
			.then((stream) => {
				this.audioAvailable = true
				this.audio = true
			})
			.catch((e) => {
				this.audioAvailable = false
			})

		if (navigator.mediaDevices.getDisplayMedia) {
			this.setState({
				screenAvailable: true,
			})
		} else {
			this.setState({
				screenAvailable: false,
			})
		}

		if (this.videoAvailable || this.audioAvailable) {
			navigator.mediaDevices.getUserMedia({ video: this.videoAvailable, audio: this.audioAvailable })
				.then((stream) => {
					window.localStream = stream
					this.localVideoref.current.srcObject = stream
				})
				.then((stream) => {})
				.catch((e) => console.log(e))
		}
	}

	getMedia = () => {
		this.setState({
			video: this.video,
			audio: this.audio,
			screen: this.screen
		}, () => {
			this.getUserMedia()
			this.connectToSocketServer()
		})
	}


	getUserMedia = () => {
		if ((this.state.video && this.videoAvailable) || (this.state.audio && this.audioAvailable)) {
			navigator.mediaDevices.getUserMedia({ video: this.state.video, audio: this.state.audio })
				.then(this.getUserMediaSuccess)
				.then((stream) => {})
				.catch((e) => console.log(e))
		} else {
			try {
				let tracks = this.localVideoref.current.srcObject.getTracks()
				tracks.forEach(track => track.stop())
			} catch (e) {
				
			}
		}
	}

	getUserMediaSuccess = (stream) => {
		try {
			window.localStream.getTracks().forEach(track => track.stop())
		} catch (e) {
			console.log(e)
		}

		window.localStream = stream
		this.localVideoref.current.srcObject = stream

		for (let id in connections) {
			if (id === socketId) continue

			connections[id].addStream(window.localStream);

			connections[id].createOffer().then((description) => {
				connections[id].setLocalDescription(description)
					.then(() => {
						socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
					})
					.catch(e => console.log(e));
			});
		}

		stream.getVideoTracks()[0].onended = () => {
			this.setState({
				video: false,
				audio: false,
			}, () => {
				try {
					let tracks = this.localVideoref.current.srcObject.getTracks()
					tracks.forEach(track => track.stop())
				} catch (e) {
					console.log(e)
				}

				let silence = () => {
					let ctx = new AudioContext()
					let oscillator = ctx.createOscillator()
					let dst = oscillator.connect(ctx.createMediaStreamDestination())
					oscillator.start()
					ctx.resume()
					return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
				}

				let black = ({ width = 640, height = 480 } = {}) => {
					let canvas = Object.assign(document.createElement("canvas"), { width, height });
					canvas.getContext('2d').fillRect(0, 0, width, height);
					let stream = canvas.captureStream();
					return Object.assign(stream.getVideoTracks()[0], { enabled: false });
				}

				let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
				window.localStream = blackSilence()
				this.localVideoref.current.srcObject = window.localStream

				for (let id in connections) {
					connections[id].addStream(window.localStream);

					connections[id].createOffer().then((description) => {
						connections[id].setLocalDescription(description)
							.then(() => {
								socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
							})
							.catch(e => console.log(e));
					});
				}
			})
		};
	}


	getDislayMedia = () => {
		if (this.state.screen) {
			if (navigator.mediaDevices.getDisplayMedia) {
				navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
					.then(this.getDislayMediaSuccess)
					.then((stream) => {})
					.catch((e) => console.log(e))
			}
		}
	}

	getDislayMediaSuccess = (stream) => {
		try {
			window.localStream.getTracks().forEach(track => track.stop())
		} catch (e) {
			console.log(e)
		}

		window.localStream = stream
		this.localVideoref.current.srcObject = stream

		for (let id in connections) {
			if (id === socketId) continue

			connections[id].addStream(window.localStream);

			connections[id].createOffer().then((description) => {
				connections[id].setLocalDescription(description)
					.then(() => {
						socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
					})
					.catch(e => console.log(e));
			});
		}


		stream.getVideoTracks()[0].onended = () => {
			this.setState({
				screen: false,
			}, () => {
				try {
					let tracks = this.localVideoref.current.srcObject.getTracks()
					tracks.forEach(track => track.stop())
				} catch (e) {
					console.log(e)
				}

				let silence = () => {
					let ctx = new AudioContext()
					let oscillator = ctx.createOscillator()
					let dst = oscillator.connect(ctx.createMediaStreamDestination())
					oscillator.start()
					ctx.resume()
					return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
				}

				let black = ({ width = 640, height = 480 } = {}) => {
					let canvas = Object.assign(document.createElement("canvas"), { width, height });
					canvas.getContext('2d').fillRect(0, 0, width, height);
					let stream = canvas.captureStream();
					return Object.assign(stream.getVideoTracks()[0], { enabled: false });
				}

				let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
				window.localStream = blackSilence()
				this.localVideoref.current.srcObject = window.localStream

				this.getUserMedia()
			})
		};
	}


	gotMessageFromServer = (fromId, message) => {
		var signal = JSON.parse(message)

		if (fromId !== socketId) {
			if (signal.sdp) {
				connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
					if (signal.sdp.type === 'offer') {
						connections[fromId].createAnswer().then((description) => {
							connections[fromId].setLocalDescription(description).then(() => {
								socket.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }));
							}).catch(e => console.log(e));
						}).catch(e => console.log(e));
					}
				}).catch(e => console.log(e));
			}

			if (signal.ice) {
				connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e));
			}
		}
	}

	connectToSocketServer = () => {
		socket = io.connect(server_url, { secure: true })

		socket.on('signal', this.gotMessageFromServer)

		socket.on('connect', () => {

			console.log("connected")
			socket.emit('join-call', window.location.href)
			socketId = socket.id

			socket.on('chat-message', this.addMessage)

			socket.on('user-left', function (id) {
				var video = document.querySelector(`[data-socket="${id}"]`);
				if (video !== null) {
					elms--
					video.parentNode.removeChild(video);

					var main = document.getElementById('main')
					var videos = main.querySelectorAll("video")

					var widthMain = main.offsetWidth

					var minWidth = "30%"
					if ((widthMain * 30 / 100) < 300) {
						minWidth = "300px"
					}

					var minHeight = "40%"

					var height = String(100 / elms) + "%"
					var width = ""
					if (elms === 1 || elms === 2) {
						width = "45%"
						height = "100%"
					} else if (elms === 3 || elms === 4) {
						width = "35%"
						height = "50%"
					} else {
						width = String(100 / elms) + "%"
					}


					for (let a = 0; a < videos.length; ++a) {
						videos[a].style.minWidth = minWidth
						videos[a].style.minHeight = minHeight
						videos[a].style.setProperty("width", width)
						videos[a].style.setProperty("height", height)
					}
				}
			});

			socket.on('user-joined', function (id, clients) {
				console.log("joined")

				clients.forEach(function (socketListId) {
					connections[socketListId] = undefined
					if (connections[socketListId] === undefined) {
						console.log("new entry")
						connections[socketListId] = new RTCPeerConnection(peerConnectionConfig);
						//Wait for their ice candidate       
						connections[socketListId].onicecandidate = function (event) {
							if (event.candidate != null) {
								socket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }));
							}
						}

						//Wait for their video stream
						connections[socketListId].onaddstream = (event) => {

							// TODO mute button, full screen button

							var searchVidep = document.querySelector(`[data-socket="${socketListId}"]`);
							if (searchVidep !== null) { // se non faccio questo check crea un quadrato vuoto inutile
								searchVidep.srcObject = event.stream
							} else {
								elms = clients.length
								var main = document.getElementById('main')
								var videos = main.querySelectorAll("video")

								var widthMain = main.offsetWidth

								var minWidth = "30%"
								if ((widthMain * 30 / 100) < 300) {
									minWidth = "300px"
								}

								var minHeight = "40%"

								var height = String(100 / elms) + "%"
								var width = ""
								if (elms === 1 || elms === 2) {
									width = "45%"
									height = "100%"
								} else if (elms === 3 || elms === 4) {
									width = "35%"
									height = "50%"
								} else {
									width = String(100 / elms) + "%"
								}


								for (let a = 0; a < videos.length; ++a) {
									videos[a].style.minWidth = minWidth
									videos[a].style.minHeight = minHeight
									videos[a].style.setProperty("width", width)
									videos[a].style.setProperty("height", height)
								}

								var video = document.createElement('video')
								video.style.minWidth = minWidth
								video.style.minHeight = minHeight
								video.style.maxHeight = "100%"
								video.style.setProperty("width", width)
								video.style.setProperty("height", height)
								video.style.margin = "10px"
								video.style.borderStyle = "solid"
								video.style.borderColor = "#bdbdbd"
								video.style.objectFit = "fill"

								video.setAttribute('data-socket', socketListId);
								video.srcObject = event.stream
								video.autoplay = true;
								// video.muted       = true;
								video.playsinline = true;

								main.appendChild(video)
							}
						}

						//Add the local video stream
						if (window.localStream !== undefined && window.localStream !== null) {
							connections[socketListId].addStream(window.localStream);
						} else {
							let silence = () => {
								let ctx = new AudioContext()
								let oscillator = ctx.createOscillator()
								let dst = oscillator.connect(ctx.createMediaStreamDestination())
								oscillator.start()
								ctx.resume()
								return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
							}

							let black = ({ width = 640, height = 480 } = {}) => {
								let canvas = Object.assign(document.createElement("canvas"), { width, height });
								canvas.getContext('2d').fillRect(0, 0, width, height);
								let stream = canvas.captureStream();
								return Object.assign(stream.getVideoTracks()[0], { enabled: false });
							}

							let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
							window.localStream = blackSilence()
							connections[socketListId].addStream(window.localStream);
						}
					}
				});

				if (id !== socketId) {
					// Create an offer to connect with your local description
					connections[id].createOffer().then((description) => {
						connections[id].setLocalDescription(description)
							.then(() => {
								socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }));
							})
							.catch(e => console.log(e));
					});
				}
			});
		})
	}


	handleVideo = () => {
		this.setState({
			video: !this.state.video,
		}, () => {
			this.getUserMedia()
		})
	}

	handleAudio = () => {
		this.setState({
			audio: !this.state.audio,
		}, () => {
			this.getUserMedia()
		})
	}

	handleScreen = () => {
		this.setState({
			screen: !this.state.screen
		}, () => {
			this.getDislayMedia()
		})
	}

	handleEndCall = () => {
		try {
			let tracks = this.localVideoref.current.srcObject.getTracks()
			tracks.forEach(track => track.stop())
		} catch (e) {

		}

		window.location.href = "/"
	}


	openChat = () => {
		this.setState({
			showModal: true,
			newmessages: 0,
		})
	}

	closeChat = () => {
		this.setState({
			showModal: false,
		})
	}

	handleMessage = (e) => {
		this.setState({
			message: e.target.value,
		})
	}

	addMessage = (data, sender) => {
		this.setState(prevState => ({
			messages: [...prevState.messages, { "sender": sender, "data": data }],
		}))

		if (sender !== socketId) {
			this.setState({
				newmessages: this.state.newmessages + 1
			})
		}

	}

	sendMessage = () => {
		socket.emit('chat-message', this.state.message)
		this.setState({
			message: "",
		})
	}

	copyUrl = (e) => {
		var text = window.location.href

		if (!navigator.clipboard) {
			var textArea = document.createElement("textarea")
			textArea.value = text
			document.body.appendChild(textArea)
			textArea.focus()
			textArea.select()
			try {
				document.execCommand('copy')
				message.success("Link copied to clipboard!")
			} catch (err) {
				message.error("Failed to copy")
			}
			document.body.removeChild(textArea)
			return
		}
		navigator.clipboard.writeText(text).then(function () {
			message.success("Link copied to clipboard!")
		}, function (err) {
			message.error("Failed to copy")
		})
	}

	handleUsername = (e) => {
		this.setState({
			username: e.target.value
		})
	}

	connect = () => {
		this.setState({
			askForUsername: false,
		}, () => {
			this.getMedia()
		})
	}

	render() {
		return (
			<div>
				{this.state.askForUsername === true ?
					<div>
						<div style={{
							background: "#232323", width: "30%", height: "auto", padding: "20px", minWidth: "400px",
							textAlign: "center", margin: "auto", marginTop: "50px", justifyContent: "center"
						}}>
							<p style={{ margin: 0, paddingRight: "50px" }}>Set your username</p>
							<Input placeholder="Username" value={this.state.username} onChange={e => this.handleUsername(e)} />
							<Button variant="contained" color="primary" onClick={this.connect} style={{ margin: "20px" }}>Connect</Button>
						</div>

						<div style={{ justifyContent: "center", textAlign: "center", paddingTop: "40px" }}>
							<video id="my-video" ref={this.localVideoref} autoPlay muted style={{
								borderStyle: "solid",
								borderColor: "#121212",
								objectFit: "fill",
								width: "60%",
								height: "30%"
							}}></video>
						</div>
					</div>
					:
					<div>
						<div className="btn-down" style={{ backgroundColor: "#232323", color: "#232323", textAlign: "center" }}>
							<IconButton style={{ color: "#fff", backgroundColor: "#323232", margin: "5px" }} onClick={this.handleVideo}>
								{(this.state.video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
							</IconButton>

							<IconButton style={{ color: "#ffffff", backgroundColor: "#da3c3f", margin: "5px" }} onClick={this.handleEndCall}>
								<CallEndIcon />
							</IconButton>

							<IconButton style={{ color: "#ffffff", backgroundColor: "#323232", margin: "5px" }} onClick={this.handleAudio}>
								{this.state.audio === true ? <MicIcon /> : <MicOffIcon />}
							</IconButton>

							{this.state.screenAvailable === true ?
								<IconButton style={{ color: "#ffffff", backgroundColor: "#323232", margin: "5px" }} onClick={this.handleScreen}>
									{this.state.screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
								</IconButton>
								: null}

							<Badge badgeContent={this.state.newmessages} max={999} color="secondary" onClick={this.openChat}>
								<IconButton style={{ color: "#ffffff", backgroundColor: "#323232"  }} onClick={this.openChat}>
									<ChatIcon />
								</IconButton>
							</Badge>
						</div>

						<Modal show={this.state.showModal} onHide={this.closeChat} style={{ zIndex: "999999", color: "#121212" }}>
							<Modal.Header closeButton>
								<Modal.Title>Chat Room</Modal.Title>
							</Modal.Header>
							<Modal.Body style={{ overflow: "auto", color: "#121212", overflowY: "auto", height: "400px" }} >
								{this.state.messages.length > 0 ? this.state.messages.map((item, index) => (
									<div key={item.sender + item.data + index}>
										<b>{item.sender}</b>
										<p style={{ wordBreak: "break-all", color: "#121212" }}>{item.data}</p>
									</div>
								)) : <p>No message yet</p>}
							</Modal.Body>
							<Modal.Footer className="div-send-msg">
								<Input placeholder="Message" value={this.state.message} onChange={e => this.handleMessage(e)} />
								<Button variant="contained" color="primary" onClick={this.sendMessage}>Send</Button>
							</Modal.Footer>
						</Modal>

						<div className="container">
							<div style={{ paddingTop: "20px" }}>
								<Input value={window.location.href} disable="true"></Input>
								<Button style={{
									backgroundColor: "#121212",
									color: "whitesmoke",
									marginLeft: "20px",
									marginTop: "10px",
									width: "120px",
									fontSize: "10px"
								}} onClick={this.copyUrl}>Copy invite link</Button>
							</div>

							<Row id="main" className="flex-container" style={{ margin: 0, padding: 0 }}>
								<video id="my-video" ref={this.localVideoref} autoPlay muted style={{
									borderStyle: "solid",
									borderColor: "#121212",
									margin: "10px",
									objectFit: "fill",
									width: "100%",
									height: "100%"
								}}></video>
							</Row>
						</div>
					</div>
				}
			</div>
		)
	}
}

export default Video;