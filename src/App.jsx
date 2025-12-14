import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Users, Swords, History, Plus, Trash2, ChevronRight, Medal, AlertCircle, Activity, Brain, X, Loader2, Utensils, Pencil, Save, Calendar } from 'lucide-react';
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
  { id: 'softdrink', label: '🥤 음료수', color: 'bg-pink-100 text-blue-600' },
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

// ELO Rating System
const calculateEloChange = (winnerRating, loserRating, scoreDiff) => {
  const K_BASE = 32;
  const marginMultiplier = 1 + (scoreDiff - 1) * 0.25; 
  const K = K_BASE * marginMultiplier;
  const expectedScore = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return Math.round(K * (1 - expectedScore));
};

const formatDate = (timestamp) => {
  if (!timestamp) return '날짜 미상';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
};

// Group matches by Date string
const groupMatchesByDate = (matchList) => {
  return matchList.reduce((groups, match) => {
    const dateStr = formatDate(match.createdAt);
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(match);
    return groups;
  }, {});
};

// --- AI API Functions (생략 가능하나 유지) ---
const getApiKey = () => {
  try {
    if (import.meta.env && import.meta.env.VITE_PERPLEXITY_API_KEY) return import.meta.env.VITE_PERPLEXITY_API_KEY;
  } catch(e) {}
  return "";
};

const fetchAIAnalysis = async (stats, playerName) => {
  const apiKey = getApiKey();
  if (!apiKey) return { style: "분석 불가", description: "API 키가 설정되지 않았습니다." };
  const prompt = `Analyze this table tennis player (Name: ${playerName}) based on stats (1-10): Power:${stats.power}, Spin:${stats.spin}, Control:${stats.control}, Serve:${stats.serve}, Footwork:${stats.footwork}. Output JSON only: { "style": "Style Name", "description": "One sentence Korean summary." }`;
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: "sonar", messages: [{ role: "system", content: "Table tennis expert. JSON only." }, { role: "user", content: prompt }] })
    });
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content.replace(/```json|```/g, '').trim());
  } catch (e) { return { style: "분석 실패", description: "AI 분석 중 오류가 발생했습니다." }; }
};

const fetchMatchAnalysis = async (player, playerMatches) => {
  const apiKey = getApiKey();
  if (!apiKey) return "API 키가 없습니다.";
  const recentHistory = playerMatches.slice(0, 5).map(m => {
    const isWin = m.winnerId === player.id;
    const opponent = m.player1Id === player.id ? m.player2Name : m.player1Name;
    return `${opponent}상대 ${isWin ? '승' : '패'} (${m.score1}:${m.score2})`;
  }).join(", ");
  const prompt = `Analyze match records for table tennis player "${player.name}". Stats: Overall ${player.overall}. Recent Matches: ${recentHistory}. Provide brief tactical advice in Korean (max 2 sentences).`;
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: "sonar", messages: [{ role: "system", content: "Warm coach." }, { role: "user", content: prompt }] })
    });
    return data.choices[0].message.content;
  } catch (e) { return "전적 분석 중 오류가 발생했습니다."; }
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

  // UI States
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [matchAnalysis, setMatchAnalysis] = useState(null);
  const [selectedBet, setSelectedBet] = useState(null);

  // Forms
  const [playerForm, setPlayerForm] = useState({ name: '', rank: '이병', stats: { power: 5, spin: 5, control: 5, serve: 5, footwork: 5 } });
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
      data.sort((a, b) => (RANK_ORDER[a.rank] - RANK_ORDER[b.rank]) || (b.rating || 1000) - (a.rating || 1000));
      setPlayers(data);
    });
    const unsubM = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), orderBy('createdAt', 'desc')), snapshot => {
      setMatches(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubP(); unsubM(); };
  }, [user]);

  // Actions
  const handleSavePlayer = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      if (!selectedPlayer) {
        const ai = await fetchAIAnalysis(playerForm.stats, playerForm.name);
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'players'), {
          ...playerForm, style: ai.style, description: ai.description, rating: 1000, createdAt: serverTimestamp()
        });
        setShowAddPlayer(false);
      } else {
        const statsChanged = JSON.stringify(playerForm.stats) !== JSON.stringify(selectedPlayer.stats);
        let updates = { ...playerForm };
        if (statsChanged) {
          const ai = await fetchAIAnalysis(playerForm.stats, playerForm.name);
          updates.style = ai.style;
          updates.description = ai.description;
        }
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', selectedPlayer.id), updates);
        setSelectedPlayer(null);
      }
      setPlayerForm({ name: '', rank: '이병', stats: { power: 5, spin: 5, control: 5, serve: 5, footwork: 5 } });
    } catch (err) { alert("오류: " + err.message); } 
    finally { setIsProcessing(false); setIsEditing(false); }
  };

  const handleDeletePlayer = async (id) => {
    if (!window.confirm("정말 삭제하시겠습니까? 기록은 유지되지만 선수 정보가 사라집니다.")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id));
      setSelectedPlayer(null);
    } catch (err) { alert("삭제 실패: " + err.message); }
  };

  const handleDeleteMatch = async (id) => {
    if (!window.confirm("기록을 삭제하시겠습니까? (주의: 이미 반영된 ELO 점수는 되돌려지지 않습니다.)")) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'matches', id)); } 
    catch (err) { alert("삭제 실패: " + err.message); }
  };

  const handleMatchSubmit = async (e) => {
    e.preventDefault();
    if (matchForm.p1 === matchForm.p2) return alert("동일 인물 불가");
    setIsProcessing(true);
    try {
      const p1 = players.find(p => p.id === matchForm.p1);
      const p2 = players.find(p => p.id === matchForm.p2);
      const s1 = parseInt(matchForm.s1), s2 = parseInt(matchForm.s2);
      
      let newR1 = p1.rating || 1000, newR2 = p2.rating || 1000;
      let winnerId = null;
      if (s1 > s2) {
        const change = calculateEloChange(newR1, newR2, Math.abs(s1 - s2));
        newR1 += change; newR2 -= change; winnerId = p1.id;
      } else if (s2 > s1) {
        const change = calculateEloChange(newR2, newR1, Math.abs(s1 - s2));
        newR2 += change; newR1 -= change; winnerId = p2.id;
      }

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), {
        player1Id: p1.id, player1Name: p1.name, score1: s1,
        player2Id: p2.id, player2Name: p2.name, score2: s2,
        bet: selectedBet ? selectedBet.label : null, winnerId, createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p1.id), { rating: newR1 });
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', p2.id), { rating: newR2 });

      setShowAddMatch(false); setMatchForm({ p1: '', p2: '', s1: '', s2: '' }); setSelectedBet(null);
    } catch (err) { alert("오류: " + err.message); } 
    finally { setIsProcessing(false); }
  };

  const getPlayerRecord = (pid) => {
    const myMatches = matches.filter(m => m.player1Id === pid || m.player2Id === pid);
    const wins = myMatches.filter(m => m.winnerId === pid).length;
    return { wins, losses: myMatches.length - wins, total: myMatches.length, history: myMatches };
  };

  // Grouped Matches
  const groupedMatches = useMemo(() => groupMatchesByDate(matches), [matches]);
  const groupedBets = useMemo(() => groupMatchesByDate(matches.filter(m => m.bet)), [matches]);

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-red-600" /></div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      <header className="bg-red-600 text-white p-4 sticky top-0 z-10 shadow-lg flex items-center justify-center gap-2">
        <Trophy className="text-yellow-300" />
        <h1 className="text-xl font-bold italic tracking-wider">59전대 탁구왕</h1>
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
                  <div className={`text-xl font-bold w-6 text-center ${i < 3 ? 'text-red-500' : 'text-gray-400'}`}>{i + 1}</div>
                  <div className="relative">
                    <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold text-lg border border-red-100">{p.name.charAt(0)}</div>
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow">{p.rank}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className="font-bold text-gray-900">{p.name}</h3>
                      <span className="text-sm font-mono font-bold text-blue-600">{p.rating || 1000} P</span>
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
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Utensils size={20} /> 내기빵 매치</h2>
              <div className="grid grid-cols-2 gap-3">
                {BETS.map(bet => (
                  <button key={bet.id} onClick={() => { setSelectedBet(bet); setShowAddMatch(true); }} className={`${bet.color} p-4 rounded-xl font-bold shadow-sm hover:opacity-80 transition-opacity flex flex-col items-center gap-2 py-6`}>
                    <span className="text-2xl">{bet.label.split(' ')[0]}</span>
                    <span className="text-sm">{bet.label.split(' ')[1] || bet.label}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="border-t pt-6">
              <h3 className="font-bold text-gray-500 mb-4 text-sm flex items-center gap-2"><History size={16}/> 내기 기록 (날짜순)</h3>
              {Object.keys(groupedBets).length === 0 ? <p className="text-center text-gray-400 text-sm py-4">아직 내기 기록이 없습니다.</p> : 
                Object.keys(groupedBets).map(date => (
                  <div key={date} className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={14} className="text-gray-400"/>
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{date}</span>
                    </div>
                    <div className="space-y-2">
                      {groupedBets[date].map(m => (
                        <div key={m.id} className="bg-white p-3 rounded-lg border border-gray-100 flex justify-between items-center text-sm shadow-sm relative pr-8">
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-bold shrink-0 mr-2">{m.bet}</span>
                          <div className="flex items-center gap-2 flex-1 justify-center">
                            <span className={m.score1 > m.score2 ? 'font-bold text-gray-900' : 'text-gray-500'}>{m.player1Name}</span>
                            <span className="font-mono font-bold text-gray-300 text-xs">VS</span>
                            <span className={m.score2 > m.score1 ? 'font-bold text-gray-900' : 'text-gray-500'}>{m.player2Name}</span>
                          </div>
                          <button onClick={() => handleDeleteMatch(m.id)} className="absolute right-2 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* Tab 3: Matches (Date Grouped) */}
        {activeTab === 'matches' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">전체 경기 기록</h2>
              <button onClick={() => { setSelectedBet(null); setShowAddMatch(true); }} className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-1 shadow-red-200 shadow-lg">
                <Swords size={16} /> 경기 추가
              </button>
            </div>
            
            {Object.keys(groupedMatches).length === 0 ? <p className="text-center text-gray-400 py-10">기록된 경기가 없습니다.</p> :
              Object.keys(groupedMatches).map(date => (
                <div key={date} className="animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <div className="sticky top-[70px] z-0 flex justify-center mb-3 mt-6">
                    <span className="bg-gray-800 text-white text-xs px-3 py-1 rounded-full font-bold shadow-md opacity-90">{date}</span>
                  </div>
                  <div className="space-y-3">
                    {groupedMatches[date].map(m => (
                      <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 relative overflow-hidden">
                         {/* 삭제 버튼 */}
                         <button onClick={() => handleDeleteMatch(m.id)} className="absolute top-2 right-2 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors z-10">
                            <Trash2 size={14} />
                         </button>
                         {m.bet && <div className="absolute top-0 left-0 bg-yellow-400 text-white text-[10px] font-bold px-2 py-1 rounded-br-lg shadow-sm z-10">{m.bet}</div>}
                        <div className="flex justify-between items-center mt-1">
                          <div className={`text-center flex-1 ${m.score1 > m.score2 ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
                            <div className="text-sm mb-1">{m.player1Name}</div>
                            <div className="text-2xl font-mono">{m.score1}</div>
                          </div>
                          <div className="text-gray-200 text-xs font-bold px-2 flex flex-col items-center gap-1">
                            <span>VS</span>
                          </div>
                          <div className={`text-center flex-1 ${m.score2 > m.score1 ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
                            <div className="text-sm mb-1">{m.player2Name}</div>
                            <div className="text-2xl font-mono">{m.score2}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-gray-200 px-6 py-2 flex justify-between z-20 pb-safe">
        {[ { id: 'players', icon: Users, label: '선수단' }, { id: 'betting', icon: Utensils, label: '내기빵' }, { id: 'matches', icon: History, label: '기록실' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 p-2 ${activeTab === tab.id ? 'text-red-600' : 'text-gray-300'}`}>
            <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-bold">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* --- Modals --- */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">{isEditing ? '정보 수정' : '선수 등록'}</h3>
            <form onSubmit={handleSavePlayer}>
              <div className="flex gap-2 mb-4">
                <input required type="text" placeholder="이름" className="flex-1 border p-2 rounded-lg" value={playerForm.name} onChange={e => setPlayerForm({...playerForm, name: e.target.value})} />
                <select className="w-24 border p-2 rounded-lg" value={playerForm.rank} onChange={e => setPlayerForm({...playerForm, rank: e.target.value})}>{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select>
              </div>
              <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-xl">
                {Object.keys(playerForm.stats).map(k => <StatBar key={k} label={k.toUpperCase()} value={playerForm.stats[k]} editable={true} onChange={(val) => setPlayerForm(p => ({...p, stats: {...p.stats, [k]: val}}))} />)}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddPlayer(false)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">취소</button>
                <button type="submit" disabled={isProcessing} className="flex-1 bg-gray-900 text-white rounded-lg py-3 font-bold flex items-center justify-center gap-2">{isProcessing && <Loader2 className="animate-spin" size={16} />}{isEditing ? '저장' : '등록'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPlayer && !isEditing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="bg-red-600 p-4 flex justify-between items-center text-white shrink-0">
              <h3 className="font-bold flex items-center gap-2"><Activity size={18} /> 선수 카드</h3>
              <div className="flex gap-2">
                <button onClick={() => { openEditMode(); setShowAddPlayer(true); }}><Pencil size={20} /></button>
                <button onClick={() => setSelectedPlayer(null)}><X size={20} /></button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto">
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

              <div className="grid grid-cols-3 gap-2 mb-6 text-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                <div><div className="text-xs text-gray-400">승</div><div className="font-bold">{getPlayerRecord(selectedPlayer.id).wins}</div></div>
                <div><div className="text-xs text-gray-400">패</div><div className="font-bold">{getPlayerRecord(selectedPlayer.id).losses}</div></div>
                <div><div className="text-xs text-gray-400">승률</div><div className="font-bold text-red-500">{getPlayerRecord(selectedPlayer.id).total ? Math.round(getPlayerRecord(selectedPlayer.id).wins/getPlayerRecord(selectedPlayer.id).total*100) : 0}%</div></div>
              </div>

              <div className="space-y-2 mb-6">
                {Object.keys(selectedPlayer.stats).map(k => <StatBar key={k} label={k.toUpperCase()} value={selectedPlayer.stats[k]} />)}
              </div>

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
                <div className="flex items-center gap-2 mb-2 text-blue-800 font-bold text-sm"><Brain size={16} /> AI 리포트</div>
                <p className="text-xs text-blue-700 leading-relaxed">{selectedPlayer.description}</p>
              </div>

              {/* 상세 전적 로그 */}
              <div className="mb-6">
                <h4 className="font-bold text-sm text-gray-700 mb-3 flex items-center gap-2"><History size={16}/> 최근 전적 로그</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                  {getPlayerRecord(selectedPlayer.id).history.length === 0 ? <p className="text-xs text-gray-400">기록 없음</p> : 
                    getPlayerRecord(selectedPlayer.id).history.map(m => {
                      const isMeP1 = m.player1Id === selectedPlayer.id;
                      const opponent = isMeP1 ? m.player2Name : m.player1Name;
                      const myScore = isMeP1 ? m.score1 : m.score2;
                      const opScore = isMeP1 ? m.score2 : m.score1;
                      const isWin = m.winnerId === selectedPlayer.id;
                      return (
                        <div key={m.id} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded border border-gray-100">
                           <span className="text-gray-500 w-20 truncate">{formatDate(m.createdAt).slice(5)}</span>
                           <span className="font-bold text-gray-700 flex-1 text-center">vs {opponent}</span>
                           <div className="flex gap-2 w-16 justify-end">
                              <span className={`font-mono font-bold ${isWin ? 'text-blue-600' : 'text-red-500'}`}>{myScore}:{opScore}</span>
                              <span className={`font-bold ${isWin ? 'text-blue-600' : 'text-gray-400'}`}>{isWin ? '승' : '패'}</span>
                           </div>
                        </div>
                      );
                    })
                  }
                </div>
              </div>

              <button onClick={() => handleDeletePlayer(selectedPlayer.id)} className="w-full py-3 text-red-500 text-sm font-bold bg-red-50 rounded-xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
                 <Trash2 size={16} /> 선수 제명 (삭제)
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <option value="">선수 1</option>{players.map(p => <option key={p.id} value={p.id}>{p.rank} {p.name}</option>)}
                  </select>
                  <input required type="number" placeholder="점수" className="w-full border p-2 rounded-lg text-center font-bold text-lg" value={matchForm.s1} onChange={e => setMatchForm({...matchForm, s1: e.target.value})} />
                </div>
                <div className="font-bold text-gray-300">VS</div>
                <div className="flex-1 text-center">
                  <select required className="w-full border p-2 rounded-lg mb-2 text-sm" value={matchForm.p2} onChange={e => setMatchForm({...matchForm, p2: e.target.value})}>
                    <option value="">선수 2</option>{players.map(p => <option key={p.id} value={p.id}>{p.rank} {p.name}</option>)}
                  </select>
                  <input required type="number" placeholder="점수" className="w-full border p-2 rounded-lg text-center font-bold text-lg" value={matchForm.s2} onChange={e => setMatchForm({...matchForm, s2: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddMatch(false)} className="flex-1 py-3 bg-gray-100 rounded-lg font-bold text-gray-500">취소</button>
                <button type="submit" disabled={isProcessing} className="flex-1 bg-red-600 text-white rounded-lg py-3 font-bold">{isProcessing ? '기록 중...' : '경기 종료'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
