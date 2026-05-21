import React, { useState, useEffect } from 'react';
import mqtt from 'mqtt';
import { Settings, Zap, Code, ShieldAlert, Activity, Wifi, ArrowRight } from 'lucide-react';
import { Esp32Code } from './Esp32Code';

export default function App() {
  const [activeTab, setActiveTab] = useState<'remote' | 'setup'>('remote');
  const [client, setClient] = useState<mqtt.MqttClient | null>(null);
  const [connected, setConnected] = useState(false);
  
  // MQTT Settings
  const [brokerUrl, setBrokerUrl] = useState('wss://test.mosquitto.org:8081');
  const [topic, setTopic] = useState('fredorch/f21s/cmd');
  
  // ESP32/BLE Status
  const [bleConnected, setBleConnected] = useState(false);
  const [bleDeviceName, setBleDeviceName] = useState('Unknown');
  const [bleRssi, setBleRssi] = useState(0);

  // Device State
  const [speed, setSpeed] = useState(0);
  const [depth, setDepth] = useState(50); // Some default
  const [power, setPower] = useState(false);

  useEffect(() => {
    return () => {
      if (client) {
        client.end();
      }
    };
  }, [client]);

  const connectMqtt = () => {
    if (client) {
      client.end();
    }
    const newClient = mqtt.connect(brokerUrl);
    
    newClient.on('connect', () => {
      setConnected(true);
      console.log('Connected to MQTT');
      newClient.subscribe(`${topic}/state`);
    });

    newClient.on('message', (t, message) => {
      if (t === `${topic}/state`) {
        try {
          const state = JSON.parse(message.toString());
          if (state.bleConnected !== undefined) setBleConnected(state.bleConnected);
          if (state.deviceName !== undefined) setBleDeviceName(state.deviceName);
          if (state.rssi !== undefined) setBleRssi(state.rssi);
        } catch (e) {
          console.error("Failed to parse state message:", e);
        }
      }
    });

    newClient.on('error', (err) => {
      console.error('MQTT Error:', err);
      setConnected(false);
    });

    setClient(newClient);
  };

  const disconnectMqtt = () => {
    if (client) {
      client.end();
      setClient(null);
      setConnected(false);
      setBleConnected(false);
    }
  };

  const publishCommand = (pwr: boolean, spd: number, dpt: number) => {
    if (client && connected) {
      const payload = JSON.stringify({
        power: pwr,
        speed: spd,
        depth: dpt
      });
      client.publish(topic, payload);
    }
  };

  const handleBleReconnect = () => {
    if (client && connected) {
      client.publish(topic, JSON.stringify({ cmd: 'reconnect_ble' }));
    }
  };

  const handlePowerToggle = () => {
    const newPower = !power;
    setPower(newPower);
    publishCommand(newPower, speed, depth);
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseInt(e.target.value);
    setSpeed(newSpeed);
    publishCommand(power, newSpeed, depth);
  };

  const handleDepthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDepth = parseInt(e.target.value);
    setDepth(newDepth);
    publishCommand(power, speed, newDepth);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#f0f0f0] font-sans flex items-center justify-center sm:p-8 relative overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-[#ff2d55] rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-[#00f2ff] rounded-full blur-[100px]"></div>
      </div>
      
      {/* Phone Mockup Container */}
      <div className="w-full sm:max-w-[340px] h-[100vh] sm:h-[680px] bg-[#111] sm:rounded-[50px] sm:border-[8px] sm:border-[#222] sm:shadow-[0_40px_100px_rgba(0,0,0,0.8)] overflow-hidden relative flex flex-col z-10">
        
        {/* Mobile Status Bar (Mockup only visible on larger screens implicitly but structurally consistent) */}
        <div className="h-8 hidden sm:flex items-center justify-between px-8 pt-4">
          <span className="text-[10px] font-bold">9:41</span>
          <div className="flex gap-1">
            <div className="w-3 h-2 border border-white/40 rounded-sm"></div>
            <div className="w-3 h-2 bg-white/80 rounded-sm"></div>
          </div>
        </div>

        {/* Header */}
        <header className="flex items-center justify-between pt-4 px-6 sm:mt-1 mt-6 shrink-0">
          <div>
            <h1 className="text-xl font-light tracking-tight text-white">F21s Bridge</h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#ff2d55] font-bold">ESP32 BLE Controller</p>
          </div>
          <div className="flex bg-white/5 border border-white/10 rounded-full p-1">
            <button 
              onClick={() => setActiveTab('remote')}
              className={`p-2 rounded-full transition-all ${activeTab === 'remote' ? 'bg-[#ff2d55] shadow-[0_0_15px_rgba(255,45,85,0.4)] text-white' : 'text-gray-400 hover:text-white'}`}
              aria-label="Remote Control"
            >
              <Zap className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setActiveTab('setup')}
              className={`p-2 rounded-full transition-all ${activeTab === 'setup' ? 'bg-[#ff2d55] shadow-[0_0_15px_rgba(255,45,85,0.4)] text-white' : 'text-gray-400 hover:text-white'}`}
              aria-label="Setup"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 scrollbar-hide">
          {activeTab === 'remote' ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
              
              {/* Connection Card */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-full ${connected ? 'bg-green-500/10 text-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'bg-black/40 text-gray-500'}`}>
                    <Wifi className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium text-xs text-white">Broker Connection</h2>
                    <p className={`text-[10px] font-mono mt-0.5 ${connected ? 'text-green-500' : 'text-gray-500'}`}>
                      {connected ? 'CONNECTED SECURELY' : 'DISCONNECTED'}
                    </p>
                  </div>
                </div>

                {connected && (
                   <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                     <div>
                       <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">BLE Target: {bleConnected ? bleDeviceName : 'None'}</p>
                       <p className={`text-[10px] font-mono ${bleConnected ? 'text-cyan-400' : 'text-rose-500'}`}>
                         {bleConnected ? `RSSI: ${bleRssi} dBm` : 'BLE DISCONNECTED'}
                       </p>
                     </div>
                     <button
                       onClick={handleBleReconnect}
                       className="bg-[#222] border border-white/10 hover:bg-white/10 text-[10px] text-white uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all"
                     >
                       Reconnect
                     </button>
                   </div>
                )}

                {!connected ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">Broker WSS URL</label>
                      <input 
                        type="text" 
                        value={brokerUrl}
                        onChange={(e) => setBrokerUrl(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ff2d55]/50 focus:ring-1 focus:ring-[#ff2d55]/50 transition-all text-cyan-400 placeholder-gray-600"
                        placeholder="wss://broker.hivemq.com:8884/mqtt"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 block">MQTT Topic</label>
                      <input 
                        type="text" 
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#ff2d55]/50 focus:ring-1 focus:ring-[#ff2d55]/50 transition-all text-cyan-400"
                      />
                    </div>
                    <button 
                      onClick={connectMqtt}
                      className="w-full bg-white/10 border border-white/20 hover:bg-white/20 text-white font-bold tracking-widest text-[10px] uppercase rounded-full py-3 transition-all"
                    >
                      Connect Bridge
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={disconnectMqtt}
                    className="w-full bg-black/40 border border-white/10 hover:bg-white/5 text-gray-400 font-bold tracking-widest text-[10px] uppercase rounded-full py-3 transition-all"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {/* Controls Section */}
              <div className={`transition-all duration-500 ${connected && bleConnected ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale'}`}>
                
                {/* Circular Speed Visualizer representing the speed slider */}
                <div className="relative w-40 h-40 mx-auto mt-6 mb-8 flex flex-col items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-white/5 shadow-inner"></div>
                  {/* Dynamic stroke dasharray for the circular progress using standard conic gradient approximation or raw value since it's a slider placeholder conceptually */}
                  <div 
                    className="absolute inset-0 rounded-full border-4 border-[#ff2d55] opacity-80"
                    style={{
                      clipPath: `polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${100 - speed}%, 50% 50%)`,
                      boxShadow: '0 0 15px #ff2d55'
                    }}
                  ></div>
                  <div className="text-center z-10 flex flex-col items-center">
                    <span className="text-4xl font-light text-white">{speed}</span>
                    <span className="text-xs text-gray-400 uppercase tracking-widest">Speed</span>
                  </div>
                  
                  {/* Invisible slider on top to control it */}
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={speed} 
                    onChange={handleSpeedChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                <div className="space-y-6">
                  {/* Master Power */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-medium text-white uppercase tracking-wider">Drive Motor</h2>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{power ? 'ACTIVE' : 'IDLE'}</p>
                    </div>
                    <button 
                      onClick={handlePowerToggle}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${power ? 'bg-[#ff2d55] shadow-[0_0_15px_rgba(255,45,85,0.4)] border border-[#ff2d55]' : 'bg-black/40 border border-white/10'}`}
                    >
                      <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition shadow-sm ${power ? 'translate-x-[26px]' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Depth Slider */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-400">
                      <span>Stroke Depth</span>
                      <span className="text-white font-mono">{depth}%</span>
                    </div>
                    <div className="relative pt-1">
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                        <div 
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00f2ff] to-[#009dff]" 
                          style={{ width: `${depth}%` }}
                        ></div>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={depth} 
                        onChange={handleDepthChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                </div>
              </div>

              {(!connected || !bleConnected) && (
                  <div className="flex gap-2 items-center justify-center text-[10px] uppercase tracking-wider text-gray-500 mt-8 font-mono">
                    <ShieldAlert className="w-3 h-3" />
                    <span>{!connected ? 'Awaiting Bridge Connection...' : 'Awaiting BLE Device...'}</span>
                  </div>
              )}

            </div>
          ) : (
            <Esp32Code topic={topic} />
          )}
        </div>
        
        {/* Mobile Home Indicator */}
        <div className="h-6 hidden sm:flex justify-center items-center shrink-0 mb-2">
          <div className="w-32 h-1 bg-white/20 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
