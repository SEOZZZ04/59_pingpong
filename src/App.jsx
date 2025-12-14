import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Users, Swords, History, Plus, Trash2, ChevronRight, Medal, AlertCircle, Activity, Brain, X, Loader2, Utensils, Pencil, Save } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  updateDoc,
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyAdfU_0hXTkBn55esF7gF8qAw6z2pWUNCg",
  authDomain: "pingpong-a501c.firebaseapp.com",
  projectId: "pingpong-a501c",
  storageBucket: "pingpong-a501c.firebasestorage.app",
  messagingSenderId: "775336039776",
  appId: "1:775336039776:web:8d764651d11552ff923a05",
  measurementId: "G-SYEN26EVNH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'ping-pong-club-59';

// --- Constants & Utils ---
const RANKS = ['병장', '상병', '일병', '이병'];
const RANK_ORDER = { '병장': 0, '상병': 1, '일병': 2, '이병': 3 };
const BETS = [
  { id: 'icecream', label: '🍦 아이스크림', color: 'bg-pink-100 text-pink-600' },
  { id: 'ramen', label: '🍜 한강라면', color: 'bg-orange-100 text-orange-600' },
  { id: 'coffee', label: '☕ 해마루 커피', color: 'bg-amber-100 text-amber-700' },
  { id: 'burger', label: '🍔 버거리', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'chicken', label: '🍗 푸라닭', color: 'bg-stone-800 text-white' },
];

const calculateOverall = (stats) => {
  const { power, spin, control, serve, footwork } = stats;
  const total = power + spin + control + serve + footwork;
  return Math.round((total / 50) * 100);
};

// ELO Rating System Implementation
// K-Factor: 기본 32, 점수차에 따라 가중치 부여 (완승일수록 점수 변동폭 큼)
const calculateEloChange = (winnerRating, loserRating, scoreDiff) => {
  const K_BASE = 32;
  // 점수차 가중치: 3점차(완승) -> 1.5배, 1점차(신승) -> 1.0배
  const marginMultiplier = 1 + (scoreDiff - 1) * 0.25; 
  const K = K_BASE * marginMultiplier;

  const expectedScore = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const ratingChange = Math.round(K * (1 - expectedScore));
  
  return ratingChange;
};

// --- AI API Functions ---
const getApiKey = () => {
  try {
    if (import.meta.env && import.meta.env.VITE_PERPLEXITY_API_KEY) return import.meta.env.VITE_PERPLEXITY_API_KEY;
  } catch(e) {}
  return "";
};

const fetchAIAnalysis = async (stats, playerName) => {
  const apiKey = getApiKey();
  if (!apiKey) return { style: "분석 불가", description: "API 키가 설정되지 않았습니다." };

  const prompt = `
    Analyze this table tennis player (Name: ${playerName}) based on stats (1-10):
    Power:${stats.power}, Spin:${stats.spin}, Control:${stats.control}, Serve:${stats.serve}, Footwork:${stats.footwork}.
    Output JSON only: { "style": "Style Name (e.g. All-round)", "description": "One sentence Korean summary of playstyle." }
  `;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "system", content: "Table tennis expert. JSON only." }, { role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    const content = data.choices[0].message.content.replace(/```json|```/g, '').trim();
    return JSON.parse(content);
  } catch (e) {
    console.error(e);
    return { style: "분석 실패", description: "AI 분석 중 오류가 발생했습니다." };
  }
};

const fetchMatchAnalysis = async (player, playerMatches) => {
  const apiKey = getApiKey();
  if (!apiKey) return "API 키가 없습니다.";

  // 최근 5경기 요약
  const recentHistory = playerMatches.slice(0, 5).map(m => {
    const isWin = m.winnerId === player.id;
    const opponent = m.player1Id === player.id ? m.player2Name : m.player1Name;
    return `${opponent}상대 ${isWin ? '승' : '패'} (${m.score1}:${m.score2})`;
  }).join(", ");

  const prompt = `
    Analyze match records for table tennis player "${player.name}".
    Stats: Overall ${player.overall} (Power ${player.stats.power}, Control ${player.stats.control}).
    Recent Matches: ${recentHistory}.
    
    Provide a brief, tactical advice in Korean (max 2 sentences). 
    Focus on who they lost to and potential weaknesses.
  `;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "system", content: "You are a warm, helpful ping pong coach." }, { role: "user", content: prompt }]
      })
    });
    const data = await res.json();
    return data.choices[0].message.content;
  } catch (e) {
    return "전적 분석 중 오류가 발생했습니다.";
  }
};

// --- Components ---
const StatBar = ({ label, value, onChange, editable }) => (
  <div className="mb-2">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-gray-600 font-medium">{label}</span>
      <span className="font-bold text-gray-800">{value}</span>
    </div>
    {editable ? (
      <input type="range" min="1" max="10" value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg accent-red-600 cursor-pointer" />
    ) : (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="bg-red-500 h-2 rounded-full transition-all duration-500" style={{ width: `${value * 10}%` }}></div>
      </div>
    )}
  </div>
);

// --- Main App ---
export default function PingPongApp() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('players');
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Forms & Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [matchAnalysis, setMatchAnalysis] = useState(null);
  const [selectedBet, setSelectedBet] = useState(null);

  const [playerForm, setPlayerForm] = useState({
    name: '', rank: '이병', stats: { power: 5, spin: 5, control: 5, serve: 5, footwork: 5 }
  });
  
  const [matchForm, setMatchForm] = useState({ p1: '', p2: '', s1: '', s2: '' });

  // Init
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
  }, []);

  // Data Sync
  useEffect(() => {
    if (!db) return;
    const unsubP = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'players')), snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data(), overall: calculateOverall(d.data().stats) }));
      // Sort: Rank -> Rating -> Name
      data.sort((a, b) => (RANK_ORDER[a.rank] - RANK_ORDER[b.rank]) || (b.rating || 1000) - (a.rating || 1000));
      setPlayers(data);
    });
    const unsubM = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), orderBy('createdAt', 'desc')), snapshot => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubP(); unsubM(); };
  }, [user]);

  // Handlers
  const handleSavePlayer = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      // 1. New Player
      if (!selectedPlayer) {
        const ai = await fetchAIAnalysis(playerForm.stats, playerForm.name);
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'players'), {
          ...playerForm, style: ai.style, description: ai.description, rating: 1000, createdAt: serverTimestamp()
        });
        setShowAddPlayer(false);
      } 
      // 2. Edit Player
      else {
        const statsChanged = JSON.stringify(playerForm.stats) !== JSON.stringify(selectedPlayer.stats);
        let updates = { ...playerForm };
        
        // Only regenerate AI report if stats changed
        if (statsChanged) {
          const ai = await fetchAIAnalysis(playerForm.stats, playerForm.name);
          updates.style = ai.style;
          updates.description = ai.description;
        }

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', selectedPlayer.id), updates);
        setSelectedPlayer(null); // Close modal
      }
      setPlayerForm({ name: '', rank: '이병', stats: { power: 5, spin: 5, control: 5, serve: 5, footwork: 5 } });
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
      setIsEditing(false);
    }
  };

  const handleMatchSubmit = async (e) => {
    e.preventDefault();
    if (matchForm.p1 === matchForm.p2) return alert("동일 인물 불가");
    setIsProcessing(true);

    try {
      const p1 = players.find(p => p.id === matchForm.p1);
      const p2 = players.find(p => p.id === matchForm.p2);
      const s1 = parseInt(matchForm.s1);
      const s2 = parseInt(matchForm.s2);
      const scoreDiff = Math.abs(s1 - s2);

      // ELO Calculation
      const r1 = p1.rating || 1000;
      const r2 = p2.rating || 1000;
      
      let newR1 = r1, newR2 = r2;
      let winnerId = null;

      if (s1 > s2) {
        const change = calculateEloChange(r1, r2, scoreDiff);
        newR1 += change; newR2 -= change;
        winnerId = p1.id;
      } else if (s2 > s1) {
        const change = calculateEloChange(r2, r1, scoreDiff);
        newR2 += change; newR1 -= change;
        winnerId = p2.id;
      }

      // 1. Record Match
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), {
        player1Id: p1.id, player1Name: p1.name, score1: s1,
        player2Id: p2.id, player2Name: p2.name, score2: s2,
        bet: selectedBet ? selectedBet.label : null,
        winnerId,
        createdAt: serverTimestamp()
      });

      // 2. Update Ratings
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p1.id), { rating: newR1 });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p2.id), { rating: newR2 });

      setShowAddMatch(false);
      setMatchForm({ p1: '', p2: '', s1: '', s2: '' });
      setSelectedBet(null);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAnalyzeMatch = async () => {
    if (!selectedPlayer) return;
    setMatchAnalysis("분석 중...");
    const playerMatches = matches.filter(m => m.player1Id === selectedPlayer.id || m.player2Id === selectedPlayer.id);
    const result = await fetchMatchAnalysis(selectedPlayer, playerMatches);
    setMatchAnalysis(result);
  };

  const openEditMode = () => {
    if (!selectedPlayer) return;
    setPlayerForm({
      name: selectedPlayer.name,
      rank: selectedPlayer.rank || '이병',
      stats: { ...selectedPlayer.stats }
    });
    setIsEditing(true);
  };

  // --- Render Helpers ---
  const getPlayerRecord = (pid) => {
    const myMatches = matches.filter(m => m.player1Id === pid || m.player2Id === pid);
    const wins = myMatches.filter(m => m.winnerId === pid).length;
    const losses = myMatches.length - wins;
    return { wins, losses, total: myMatches.length };
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-red-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      {/* Header */}
      <header className="bg-red-600 text-white p-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-center gap-2">
          <Trophy className="text-yellow-300" />
          <h1 className="text-xl font-bold italic tracking-wider">59전대 탁구왕</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        {/* Tab 1: Players */}
        {activeTab === 'players' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">선수단 랭킹</h2>
              <button onClick={() => { setIsEditing(false); setPlayerForm({name:'', rank:'이병', stats:{power:5,spin:5,control:5,serve:5,footwork:5}}); setShowAddPlayer(true); }} className="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1">
                <Plus size={16} /> 등록
              </button>
            </div>
            
            {players.map((p, i) => {
              const rec = getPlayerRecord(p.id);
              return (
                <div key={p.id} onClick={() => { setSelectedPlayer(p); setMatchAnalysis(null); setIsEditing(false); }} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-all">
                  <div className="text-xl font-bold text-gray-400 w-6 text-center">{i + 1}</div>
                  <div className="relative">
                    <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold text-lg border border-red-100">
                      {p.name.charAt(0)}
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow">{p.rank}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-gray-900">{p.name}</h3>
                      <span className="text-sm font-mono font-bold text-blue-600">{p.rating || 1000} MMR</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">OVR {p.overall}</span>
                      <span>{rec.wins}승 {rec.losses}패 ({rec.total ? Math.round(rec.wins/rec.total*100) : 0}%)</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Betting */}
        {activeTab === 'betting' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold flex items-center gap-2"><Utensils size={20} /> 내기빵 매치</h2>
            <div className="grid grid-cols-2 gap-3">
              {BETS.map(bet => (
                <button key={bet.id} onClick={() => { setSelectedBet(bet); setShowAddMatch(true); }} className={`${bet.color} p-4 rounded-xl font-bold shadow-sm hover:opacity-80 transition-opacity flex flex-col items-center gap-2 py-6`}>
                  <span className="text-2xl">{bet.label.split(' ')[0]}</span>
                  <span className="text-sm">{bet.label.split(' ')[1] || bet.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-8">
              <h3 className="font-bold text-gray-500 mb-2 text-sm">최근 내기 기록</h3>
              {matches.filter(m => m.bet).map(m => (
                <div key={m.id} className="bg-white p-3 rounded-lg border border-gray-100 mb-2 flex justify-between items-center text-sm">
                  <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-bold">{m.bet}</span>
                  <div className="flex gap-2">
                    <span className={m.score1 > m.score2 ? 'font-bold' : 'text-gray-500'}>{m.player1Name}</span>
                    <span className="text-gray-300">vs</span>
                    <span className={m.score2 > m.score1 ? 'font-bold' : 'text-gray-500'}>{m.player2Name}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Matches (List) */}
        {activeTab === 'matches' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">경기 기록</h2>
              <button onClick={() => { setSelectedBet(null); setShowAddMatch(true); }} className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1 shadow-red-200 shadow-lg">
                <Swords size={16} /> 경기 추가
              </button>
            </div>
            {matches.map(m => (
              <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 relative overflow-hidden">
                {m.bet && <div className="absolute top-0 right-0 bg-yellow-400 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">{m.bet}</div>}
                <div className="flex justify-between items-center">
                  <div className={`text-center flex-1 ${m.score1 > m.score2 ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
                    <div className="text-sm mb-1">{m.player1Name}</div>
                    <div className="text-2xl">{m.score1}</div>
                  </div>
                  <div className="text-gray-300 text-xs font-bold px-2">VS</div>
                  <div className={`text-center flex-1 ${m.score2 > m.score1 ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
                    <div className="text-sm mb-1">{m.player2Name}</div>
                    <div className="text-2xl">{m.score2}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Navigation */}
      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 px-6 py-2 flex justify-between z-20 pb-safe">
        {[
          { id: 'players', icon: Users, label: '선수단' },
          { id: 'betting', icon: Utensils, label: '내기빵' },
          { id: 'matches', icon: History, label: '기록실' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 p-2 ${activeTab === tab.id ? 'text-red-600' : 'text-gray-300'}`}>
            <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-bold">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* --- Modals --- */}

      {/* 1. Add/Edit Player Modal */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">{isEditing ? '선수 정보 수정' : '새 선수 등록'}</h3>
            <form onSubmit={handleSavePlayer}>
              <div className="flex gap-2 mb-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1">이름</label>
                  <input required type="text" className="w-full border p-2 rounded-lg" value={playerForm.name} onChange={e => setPlayerForm({...playerForm, name: e.target.value})} disabled={isProcessing} />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-bold text-gray-500 mb-1">계급</label>
                  <select className="w-full border p-2 rounded-lg" value={playerForm.rank} onChange={e => setPlayerForm({...playerForm, rank: e.target.value})}>
                    {RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-xl">
                <p className="text-xs font-bold text-gray-500 mb-2">능력치 설정 (1-10)</p>
                {Object.keys(playerForm.stats).map(k => (
                  <StatBar key={k} label={k.toUpperCase()} value={playerForm.stats[k]} editable={true} onChange={(val) => setPlayerForm(p => ({...p, stats: {...p.stats, [k]: val}}))} />
                ))}
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddPlayer(false)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">취소</button>
                <button type="submit" disabled={isProcessing} className="flex-1 bg-gray-900 text-white rounded-lg py-3 font-bold flex items-center justify-center gap-2">
                  {isProcessing && <Loader2 className="animate-spin" size={16} />}
                  {isEditing ? '저장' : '등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Player Detail Modal */}
      {selectedPlayer && !isEditing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-red-600 p-4 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2"><Activity size={18} /> 선수 카드</h3>
              <div className="flex gap-2">
                <button onClick={() => { openEditMode(); setShowAddPlayer(true); }}><Pencil size={20} /></button>
                <button onClick={() => setSelectedPlayer(null)}><X size={20} /></button>
              </div>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded">{selectedPlayer.rank}</span>
                    <h2 className="text-2xl font-bold">{selectedPlayer.name}</h2>
                  </div>
                  <p className="text-sm text-blue-600 font-bold mt-1">{selectedPlayer.style}</p>
                </div>
                <div className="text-center">
                   <div className="text-xs text-gray-400 font-bold">RATING</div>
                   <div className="text-2xl font-black text-red-600 italic">{selectedPlayer.rating || 1000}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-6 text-center bg-gray-50 p-3 rounded-xl">
                <div><div className="text-xs text-gray-400">승</div><div className="font-bold">{getPlayerRecord(selectedPlayer.id).wins}</div></div>
                <div><div className="text-xs text-gray-400">패</div><div className="font-bold">{getPlayerRecord(selectedPlayer.id).losses}</div></div>
                <div><div className="text-xs text-gray-400">승률</div><div className="font-bold text-red-500">{getPlayerRecord(selectedPlayer.id).total ? Math.round(getPlayerRecord(selectedPlayer.id).wins/getPlayerRecord(selectedPlayer.id).total*100) : 0}%</div></div>
              </div>

              <div className="space-y-2 mb-6">
                {Object.keys(selectedPlayer.stats).map(k => (
                  <StatBar key={k} label={k.toUpperCase()} value={selectedPlayer.stats[k]} />
                ))}
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                <div className="flex items-center gap-2 mb-2 text-blue-800 font-bold text-sm">
                  <Brain size={16} /> AI 리포트
                </div>
                <p className="text-xs text-blue-700 leading-relaxed">{selectedPlayer.description}</p>
              </div>

              {matchAnalysis ? (
                <div className="bg-gray-900 text-gray-100 p-4 rounded-xl text-xs leading-relaxed animate-in fade-in slide-in-from-bottom-2">
                  <div className="font-bold text-yellow-400 mb-2 flex items-center gap-2"><Activity size={14}/> 전적 정밀 분석</div>
                  {matchAnalysis}
                </div>
              ) : (
                <button onClick={handleAnalyzeMatch} className="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors">
                  <Activity size={16} /> 최근 전적 분석하기 (AI)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Add Match Modal */}
      {showAddMatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              {selectedBet ? <><span className="text-2xl">⚡</span> {selectedBet.label} 매치</> : '경기 기록'}
            </h3>
            <form onSubmit={handleMatchSubmit}>
              <div className="flex items-center gap-2 mb-6">
                <div className="flex-1 text-center">
                  <select required className="w-full border p-2 rounded-lg mb-2 text-sm" value={matchForm.p1} onChange={e => setMatchForm({...matchForm, p1: e.target.value})}>
                    <option value="">선수 1</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.rank} {p.name}</option>)}
                  </select>
                  <input required type="number" placeholder="점수" className="w-full border p-2 rounded-lg text-center font-bold text-lg" value={matchForm.s1} onChange={e => setMatchForm({...matchForm, s1: e.target.value})} />
                </div>
                <div className="font-bold text-gray-300">VS</div>
                <div className="flex-1 text-center">
                  <select required className="w-full border p-2 rounded-lg mb-2 text-sm" value={matchForm.p2} onChange={e => setMatchForm({...matchForm, p2: e.target.value})}>
                    <option value="">선수 2</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.rank} {p.name}</option>)}
                  </select>
                  <input required type="number" placeholder="점수" className="w-full border p-2 rounded-lg text-center font-bold text-lg" value={matchForm.s2} onChange={e => setMatchForm({...matchForm, s2: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddMatch(false)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">취소</button>
                <button type="submit" disabled={isProcessing} className="flex-1 bg-red-600 text-white rounded-lg py-3 font-bold">
                  {isProcessing ? '기록 중...' : '경기 종료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
