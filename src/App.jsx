import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Users, Swords, History, Plus, Trash2, ChevronRight, Medal, AlertCircle, Activity, Brain, X, Loader2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

// --- Firebase Initialization ---
// 사용자가 제공한 하드코딩된 설정을 우선 적용합니다.
const firebaseConfig = {
  apiKey: "AIzaSyAdfU_0hXTkBn55esF7gF8qAw6z2pWUNCg",
  authDomain: "pingpong-a501c.firebaseapp.com",
  projectId: "pingpong-a501c",
  storageBucket: "pingpong-a501c.firebasestorage.app",
  messagingSenderId: "775336039776",
  appId: "1:775336039776:web:8d764651d11552ff923a05",
  measurementId: "G-SYEN26EVNH"
};

// 앱 초기화 (설정값이 유효할 때만)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// 앱 ID는 고정값 사용
const appId = 'ping-pong-club-59';

// --- AI Engine (Perplexity API) ---
const calculateOverall = (stats) => {
  const { power, spin, control, serve, footwork } = stats;
  const total = power + spin + control + serve + footwork;
  return Math.round((total / 50) * 100);
};

const fetchAIAnalysis = async (stats, playerName) => {
  let apiKey = "";
  
  // API Key 탐색
  try {
    if (import.meta.env && import.meta.env.VITE_PERPLEXITY_API_KEY) {
      apiKey = import.meta.env.VITE_PERPLEXITY_API_KEY;
    } else if (typeof process !== 'undefined' && process.env) {
      apiKey = process.env.VITE_PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY;
    }
  } catch (e) {
    console.warn("Env Check Failed", e);
  }

  // 키가 없으면 더미 데이터 대신 안내 메시지 반환
  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return {
      style: "설정 필요",
      description: "AI 분석 기능을 사용하려면 배포 환경 변수(VITE_PERPLEXITY_API_KEY) 설정이 필요합니다."
    };
  }

  const prompt = `
    Analyze this table tennis player based on these stats (1-10 scale):
    Name: ${playerName}
    Power: ${stats.power}
    Spin: ${stats.spin}
    Control: ${stats.control}
    Serve: ${stats.serve}
    Footwork: ${stats.footwork}

    Output format (JSON only):
    {
      "style": "Short style name (e.g. Aggressive Looper, Defensive Chopper)",
      "description": "1 sentence analysis of their strengths and playstyle in Korean."
    }
  `;

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a table tennis expert analyst. Return JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);

  } catch (error) {
    console.error("API Error:", error);
    return {
      style: "분석 실패",
      description: `오류가 발생했습니다: ${error.message}`
    };
  }
};

// --- Components ---
const LoadingSpinner = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
  </div>
);

const EmptyState = ({ message, icon: Icon }) => (
  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
    {Icon && <Icon size={48} className="mb-4 opacity-20" />}
    <p>{message}</p>
  </div>
);

const StatBar = ({ label, value, color = "bg-blue-500" }) => (
  <div className="mb-2">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-gray-600 font-medium">{label}</span>
      <span className="font-bold text-gray-800">{value}</span>
    </div>
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${value * 10}%` }}></div>
    </div>
  </div>
);

// --- Main App Component ---

export default function PingPongApp() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('players'); 
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerStats, setNewPlayerStats] = useState({
    power: 5, spin: 5, control: 5, serve: 5, footwork: 5
  });

  const [showAddMatch, setShowAddMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({ p1: '', p2: '', s1: '', s2: '' });
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // 1. Authentication (수정됨: 무한 로딩 방지)
  useEffect(() => {
    const initAuth = async () => {
      try {
        // 이미 로그인된 상태가 아닐 때만 시도
        if (!auth.currentUser) {
           await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        // 에러가 나도 코드가 멈추지 않도록 처리
        if (err.code === 'auth/configuration-not-found') {
           setError("Firebase 콘솔에서 'Anonymous Auth'가 꺼져 있습니다. 설정 > Authentication > Sign-in method에서 켜주세요.");
        } else {
           setError(`로그인 실패: ${err.message}`);
        }
        setLoading(false); // 에러 발생 시 로딩 종료
      }
    };

    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false); // 상태가 변하면 무조건 로딩 종료
    });

    // 안전장치: 3초 뒤 강제 로딩 종료 (네트워크 지연 대비)
    const timeout = setTimeout(() => setLoading(false), 3000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user || !db) return;

    // Players
    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const qPlayers = query(playersRef, orderBy('name'));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const pData = doc.data();
        const stats = pData.stats || { power: 5, spin: 5, control: 5, serve: 5, footwork: 5 };
        return { 
          id: doc.id, ...pData, stats, overall: calculateOverall(stats),
          style: pData.style || "분석 전", description: pData.description || ""
        };
      });
      setPlayers(data);
    }, (err) => console.error("Fetch Error:", err));

    // Matches
    const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
    const qMatches = query(matchesRef);
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMatches(data);
    }, (err) => console.error("Fetch Error:", err));

    return () => { unsubPlayers(); unsubMatches(); };
  }, [user]);

  // Actions
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    setIsAnalyzing(true);
    try {
      const aiResult = await fetchAIAnalysis(newPlayerStats, newPlayerName.trim());
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'players'), {
        name: newPlayerName.trim(),
        stats: newPlayerStats,
        style: aiResult.style,
        description: aiResult.description,
        createdAt: serverTimestamp()
      });
      setNewPlayerName('');
      setNewPlayerStats({ power: 5, spin: 5, control: 5, serve: 5, footwork: 5 });
      setShowAddPlayer(false);
    } catch (err) {
      alert("등록 실패: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeletePlayer = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id));
      if (selectedPlayer?.id === id) setSelectedPlayer(null);
    } catch (err) {
      alert("삭제 실패: " + err.message);
    }
  };

  const handleAddMatch = async (e) => {
    e.preventDefault();
    if (!matchForm.p1 || !matchForm.p2 || !matchForm.s1 || !matchForm.s2) {
      alert("모든 항목을 입력해주세요."); return;
    }
    if (matchForm.p1 === matchForm.p2) {
      alert("서로 다른 선수를 선택해주세요."); return;
    }
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), {
        player1Id: matchForm.p1, player2Id: matchForm.p2,
        score1: parseInt(matchForm.s1), score2: parseInt(matchForm.s2),
        player1Name: players.find(p => p.id === matchForm.p1)?.name || 'Unknown',
        player2Name: players.find(p => p.id === matchForm.p2)?.name || 'Unknown',
        createdAt: serverTimestamp()
      });
      setMatchForm({ p1: '', p2: '', s1: '', s2: '' });
      setShowAddMatch(false);
    } catch (err) {
      alert("기록 실패: " + err.message);
    }
  };

  const handleDeleteMatch = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'matches', id)); } 
    catch (err) { alert("삭제 실패: " + err.message); }
  };

  // Ranking
  const rankings = useMemo(() => {
    const stats = {};
    players.forEach(p => { stats[p.id] = { ...p, wins: 0, losses: 0, games: 0, winRate: 0 }; });
    matches.forEach(m => {
      const update = (pid, win) => {
        if (!stats[pid]) stats[pid] = { id: pid, name: pid === m.player1Id ? m.player1Name : m.player2Name, wins: 0, losses: 0, games: 0, winRate: 0 };
        stats[pid].games++;
        if (win) stats[pid].wins++; else stats[pid].losses++;
      };
      if (m.score1 > m.score2) { update(m.player1Id, true); update(m.player2Id, false); }
      else if (m.score2 > m.score1) { update(m.player1Id, false); update(m.player2Id, true); }
    });
    return Object.values(stats)
      .map(s => ({ ...s, winRate: s.games ? Math.round((s.wins / s.games) * 100) : 0 }))
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
  }, [players, matches]);

  // UI Renderers
  const renderPlayers = () => (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">등록된 선수 ({players.length})</h2>
        <button onClick={() => setShowAddPlayer(true)} className="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1 active:scale-95 transition-transform">
          <Plus size={16} /> 선수 등록
        </button>
      </div>
      {players.length === 0 ? <EmptyState message="등록된 선수가 없습니다." icon={Users} /> : (
        <div className="grid grid-cols-1 gap-3">
          {players.map(p => (
            <div key={p.id} onClick={() => setSelectedPlayer(p)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold text-lg border border-red-100">{p.name.charAt(0)}</div>
                <div>
                  <h3 className="font-bold text-gray-900">{p.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">OVR <span className="font-bold">{p.overall}</span></span>
                    <span className="text-xs text-blue-600 font-medium truncate max-w-[120px]">{p.style}</span>
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderMatches = () => (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">최근 경기 ({matches.length})</h2>
        <button onClick={() => setShowAddMatch(true)} className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1 shadow-lg shadow-red-200 active:scale-95 transition-transform">
          <Swords size={16} /> 경기 기록
        </button>
      </div>
      {matches.length === 0 ? <EmptyState message="아직 경기 기록이 없습니다." icon={Swords} /> : (
        <div className="space-y-3">
          {matches.map(m => (
            <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-500 via-transparent to-red-500 opacity-20"></div>
              <div className="flex justify-between items-center p-4">
                <div className={`flex-1 text-center ${m.score1 > m.score2 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                  <div className="text-lg">{m.player1Name}</div>
                  <div className={`text-2xl mt-1 ${m.score1 > m.score2 ? 'text-blue-600' : 'text-gray-400'}`}>{m.score1}</div>
                </div>
                <div className="px-2 text-gray-300 text-sm font-mono">VS</div>
                <div className={`flex-1 text-center ${m.score2 > m.score1 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                  <div className="text-lg">{m.player2Name}</div>
                  <div className={`text-2xl mt-1 ${m.score2 > m.score1 ? 'text-red-600' : 'text-gray-400'}`}>{m.score2}</div>
                </div>
                <button onClick={() => handleDeleteMatch(m.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderRecords = () => (
    <div className="p-4 space-y-4 pb-24">
      <h2 className="text-lg font-bold text-gray-800 mb-4">전체 랭킹</h2>
      {rankings.length === 0 ? <EmptyState message="데이터가 부족합니다." icon={Medal} /> : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr><th className="px-4 py-3 text-center">#</th><th className="px-4 py-3">이름</th><th className="px-4 py-3 text-center">승</th><th className="px-4 py-3 text-center">패</th><th className="px-4 py-3 text-center">승률</th></tr>
            </thead>
            <tbody>
              {rankings.map((p, i) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center font-bold text-gray-400">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}<span className="block text-[10px] text-gray-400">OVR {p.overall}</span></td>
                  <td className="px-4 py-3 text-center text-blue-600 font-bold">{p.wins}</td>
                  <td className="px-4 py-3 text-center text-red-500">{p.losses}</td>
                  <td className="px-4 py-3 text-center font-bold">{p.winRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  if (loading) return <div className="h-screen bg-white flex flex-col items-center justify-center"><LoadingSpinner /><p className="text-gray-400 text-sm mt-4">데이터 불러오는 중...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-safe">
      <header className="bg-red-600 text-white p-4 shadow-lg sticky top-0 z-10 flex items-center justify-center relative">
        <div className="flex items-center gap-2"><Trophy className="text-yellow-300" /><h1 className="text-xl font-bold italic tracking-wider">59전대 탁구왕</h1></div>
      </header>

      {error && (
        <div className="m-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-2 text-sm border border-red-100">
          <AlertCircle className="shrink-0 mt-0.5" size={16} />
          <span>{error}</span>
        </div>
      )}

      <main className="max-w-md mx-auto min-h-[calc(100vh-140px)]">
        {activeTab === 'players' && renderPlayers()}
        {activeTab === 'matches' && renderMatches()}
        {activeTab === 'records' && renderRecords()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 flex justify-between items-center z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe-bottom">
        {[
          { id: 'players', icon: Users, label: '선수단' },
          { id: 'matches', icon: Swords, label: '경기장' },
          { id: 'records', icon: History, label: '기록실' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === tab.id ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Modals */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-xl p-6">
            <h3 className="text-xl font-bold mb-4">새 선수 등록</h3>
            <form onSubmit={handleAddPlayer}>
              <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-1">이름</label><input type="text" className="w-full border border-gray-300 rounded-lg p-3" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} disabled={isAnalyzing} /></div>
              <div className="space-y-4 mb-6">
                <p className="text-sm font-bold text-gray-800 border-b pb-2">능력치 (1-10)</p>
                {[ {k:'power',l:'💥 파워'}, {k:'spin',l:'🌪️ 스핀'}, {k:'control',l:'🎯 컨트롤'}, {k:'serve',l:'🚀 서브'}, {k:'footwork',l:'🏃 풋워크'} ].map(s => (
                  <div key={s.k}>
                    <div className="flex justify-between text-xs mb-1"><label>{s.l}</label><span className="font-bold text-red-600">{newPlayerStats[s.k]}</span></div>
                    <input type="range" min="1" max="10" step="1" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600" value={newPlayerStats[s.k]} onChange={e => setNewPlayerStats({...newPlayerStats, [s.k]: parseInt(e.target.value)})} disabled={isAnalyzing} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddPlayer(false)} className="flex-1 py-3 bg-gray-100 rounded-lg" disabled={isAnalyzing}>취소</button>
                <button type="submit" className="flex-1 bg-red-600 text-white rounded-lg py-3 flex items-center justify-center gap-2" disabled={isAnalyzing}>{isAnalyzing ? <><Loader2 className="animate-spin" size={18} /> 분석중...</> : "등록"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold mb-4">경기 결과</h3>
            <form onSubmit={handleAddMatch}>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1"><label className="block text-xs mb-1">선수 1</label><select className="w-full border p-2 rounded-lg" value={matchForm.p1} onChange={e => setMatchForm({...matchForm, p1: e.target.value})}><option value="">선택</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="flex-1"><label className="block text-xs mb-1">점수</label><input type="number" className="w-full border p-2 rounded-lg text-center" value={matchForm.s1} onChange={e => setMatchForm({...matchForm, s1: e.target.value})} /></div>
              </div>
              <div className="flex items-center justify-center mb-4 font-bold text-gray-400">VS</div>
              <div className="flex items-center gap-2 mb-6">
                <div className="flex-1"><label className="block text-xs mb-1">선수 2</label><select className="w-full border p-2 rounded-lg" value={matchForm.p2} onChange={e => setMatchForm({...matchForm, p2: e.target.value})}><option value="">선택</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="flex-1"><label className="block text-xs mb-1">점수</label><input type="number" className="w-full border p-2 rounded-lg text-center" value={matchForm.s2} onChange={e => setMatchForm({...matchForm, s2: e.target.value})} /></div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddMatch(false)} className="flex-1 py-3 bg-gray-100 rounded-lg">취소</button>
                <button type="submit" className="flex-1 bg-red-600 text-white rounded-lg py-3">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="bg-red-600 p-4 flex justify-between items-center text-white"><h3 className="text-lg font-bold flex items-center gap-2"><Activity size={18} /> 선수 분석</h3><button onClick={() => setSelectedPlayer(null)}><X size={20} /></button></div>
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div><h2 className="text-2xl font-bold">{selectedPlayer.name}</h2><p className="text-sm text-gray-500">{selectedPlayer.style}</p></div>
                <div className="text-center bg-red-50 px-3 py-2 rounded-lg border border-red-100"><div className="text-xs text-red-400 font-bold">OVR</div><div className="text-2xl font-black text-red-600">{selectedPlayer.overall}</div></div>
              </div>
              <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <StatBar label="💥 파워" value={selectedPlayer.stats.power} color="bg-red-500" /><StatBar label="🌪️ 스핀" value={selectedPlayer.stats.spin} color="bg-orange-500" /><StatBar label="🎯 컨트롤" value={selectedPlayer.stats.control} color="bg-green-500" /><StatBar label="🚀 서브" value={selectedPlayer.stats.serve} color="bg-purple-500" /><StatBar label="🏃 풋워크" value={selectedPlayer.stats.footwork} color="bg-blue-500" />
              </div>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-2 mb-6 items-start"><Brain className="text-blue-600 shrink-0 mt-1" size={20} /><div className="text-xs text-blue-800 leading-relaxed"><span className="font-bold block mb-1">AI 리포트:</span> {selectedPlayer.description}</div></div>
              <button onClick={() => handleDeletePlayer(selectedPlayer.id)} className="w-full py-3 text-red-500 text-sm font-medium bg-red-50 rounded-lg flex items-center justify-center gap-2"><Trash2 size={16} /> 선수 삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
