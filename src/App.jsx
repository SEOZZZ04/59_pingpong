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
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  return null;
};

const firebaseConfig = {
  apiKey: "AIzaSyAdfU_0hXTkBn55esF7gF8qAw6z2pWUNCg",
  authDomain: "pingpong-a501c.firebaseapp.com",
  projectId: "pingpong-a501c",
  storageBucket: "pingpong-a501c.firebasestorage.app",
  messagingSenderId: "775336039776",
  appId: "1:775336039776:web:8d764651d11552ff923a05",
  measurementId: "G-SYEN26EVNH"
};;

// --- AI Engine (Perplexity API) ---

// 1. 오버올 계산 (로컬 계산)
const calculateOverall = (stats) => {
  const { power, spin, control, serve, footwork } = stats;
  const total = power + spin + control + serve + footwork;
  return Math.round((total / 50) * 100); // 100점 만점 환산
};

// 2. AI 분석 호출 (Perplexity API)
const fetchAIAnalysis = async (stats, playerName) => {
  // API 키 가져오기 (ES2015 호환성 수정)
  // import.meta 대신 process.env를 사용하여 호환성 경고 해결
  let apiKey = "YOUR_API_KEY_HERE";
  
  try {
    if (typeof process !== 'undefined' && process.env) {
      apiKey = process.env.VITE_PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY || "YOUR_API_KEY_HERE";
    }
  } catch (e) {
    console.warn("환경 변수 접근 중 오류 발생 (기본값 사용):", e);
  }

  // API 키가 없거나 기본값인 경우 더미 데이터 반환 (개발 환경용 안전장치)
  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    console.warn("API Key missing. Using fallback logic.");
    return {
      style: "데이터 분석 대기중",
      description: "API 키가 설정되지 않아 AI 분석을 수행할 수 없습니다. (환경변수 VITE_PERPLEXITY_API_KEY 확인 필요)"
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
        model: "sonar", // 요청하신 모델 사용
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
    
    // JSON 파싱 시도 (Markdown 코드 블록 제거 등 처리)
    const jsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);

  } catch (error) {
    console.error("Perplexity API Error:", error);
    return {
      style: "분석 실패",
      description: `AI 분석 중 오류가 발생했습니다: ${error.message}`
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

  // Modals & Forms
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // AI 분석 로딩 상태
  const [newPlayerName, setNewPlayerName] = useState('');
  
  // New Player Stats State
  const [newPlayerStats, setNewPlayerStats] = useState({
    power: 5,
    spin: 5,
    control: 5,
    serve: 5,
    footwork: 5
  });

  const [showAddMatch, setShowAddMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({ p1: '', p2: '', s1: '', s2: '' });
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // 1. Authentication
  useEffect(() => {
    if (!auth) {
      setError("Firebase 설정이 올바르지 않습니다.");
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setError(`로그인 실패: ${err.message}`);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Data Fetching
  useEffect(() => {
    if (!user || !db) return;

    // Players Fetch
    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const qPlayers = query(playersRef, orderBy('name'));
    
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const pData = doc.data();
        const stats = pData.stats || { power: 5, spin: 5, control: 5, serve: 5, footwork: 5 };
        // 오버올은 항상 실시간 계산 (저장된 값이 없어도 호환성 유지)
        const overall = calculateOverall(stats);
        
        return { 
          id: doc.id, 
          ...pData, 
          stats, 
          overall,
          // 저장된 AI 데이터가 없으면 기본값 표시
          style: pData.style || "분석 전",
          description: pData.description || "상세 분석 데이터가 없습니다."
        };
      });
      setPlayers(data);
    }, (err) => console.error("Players Fetch Error:", err));

    // Matches Fetch
    const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
    const qMatches = query(matchesRef);
    
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setMatches(data);
    }, (err) => console.error("Matches Fetch Error:", err));

    return () => {
      unsubPlayers();
      unsubMatches();
    };
  }, [user]);

  // Actions
  const handleAddPlayer = async (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    
    setIsAnalyzing(true);

    try {
      // 1. AI 분석 호출 (Perplexity)
      const aiResult = await fetchAIAnalysis(newPlayerStats, newPlayerName.trim());
      
      // 2. Firestore 저장
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'players'), {
        name: newPlayerName.trim(),
        stats: newPlayerStats,
        style: aiResult.style,
        description: aiResult.description,
        createdAt: serverTimestamp()
      });

      // 3. 초기화
      setNewPlayerName('');
      setNewPlayerStats({ power: 5, spin: 5, control: 5, serve: 5, footwork: 5 });
      setShowAddPlayer(false);
    } catch (err) {
      alert("선수 등록 실패: " + err.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeletePlayer = async (id) => {
    if (!window.confirm("정말 이 선수를 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', id));
      if (selectedPlayer?.id === id) setSelectedPlayer(null);
    } catch (err) {
      alert("삭제 실패: " + err.message);
    }
  };

  const handleAddMatch = async (e) => {
    e.preventDefault();
    if (!matchForm.p1 || !matchForm.p2 || matchForm.s1 === '' || matchForm.s2 === '') {
      alert("모든 항목을 입력해주세요.");
      return;
    }
    if (matchForm.p1 === matchForm.p2) {
      alert("서로 다른 선수를 선택해주세요.");
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'matches'), {
        player1Id: matchForm.p1,
        player2Id: matchForm.p2,
        score1: parseInt(matchForm.s1),
        score2: parseInt(matchForm.s2),
        player1Name: players.find(p => p.id === matchForm.p1)?.name || 'Unknown',
        player2Name: players.find(p => p.id === matchForm.p2)?.name || 'Unknown',
        createdAt: serverTimestamp()
      });
      setMatchForm({ p1: '', p2: '', s1: '', s2: '' });
      setShowAddMatch(false);
    } catch (err) {
      alert("경기 기록 실패: " + err.message);
    }
  };

  const handleDeleteMatch = async (id) => {
    if (!window.confirm("이 경기 기록을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'matches', id));
    } catch (err) {
      alert("삭제 실패: " + err.message);
    }
  };

  // Ranking Calculation
  const rankings = useMemo(() => {
    const stats = {};
    players.forEach(p => {
      stats[p.id] = { ...p, wins: 0, losses: 0, games: 0, winRate: 0 };
    });

    matches.forEach(m => {
      if (!stats[m.player1Id] && m.player1Id) stats[m.player1Id] = { id: m.player1Id, name: m.player1Name, wins: 0, losses: 0, games: 0, winRate: 0, overall: 0 };
      if (!stats[m.player2Id] && m.player2Id) stats[m.player2Id] = { id: m.player2Id, name: m.player2Name, wins: 0, losses: 0, games: 0, winRate: 0, overall: 0 };
      
      const p1 = stats[m.player1Id];
      const p2 = stats[m.player2Id];

      if (p1 && p2) {
        if (m.score1 > m.score2) {
          p1.wins++;
          p2.losses++;
        } else if (m.score2 > m.score1) {
          p2.wins++;
          p1.losses++;
        }
        p1.games++;
        p2.games++;
      }
    });

    return Object.values(stats)
      .map(s => ({
        ...s,
        winRate: s.games === 0 ? 0 : Math.round((s.wins / s.games) * 100)
      }))
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
  }, [players, matches]);

  // Views
  const renderPlayers = () => (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">선수단 ({players.length})</h2>
        <button 
          onClick={() => setShowAddPlayer(true)}
          className="bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1 active:scale-95 transition-transform"
        >
          <Plus size={16} /> 선수 등록
        </button>
      </div>

      {players.length === 0 ? (
        <EmptyState message="등록된 선수가 없습니다." icon={Users} />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {players.map(player => (
            <div 
              key={player.id} 
              onClick={() => setSelectedPlayer(player)}
              className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold text-lg border border-red-100">
                    {player.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{player.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                        OVR <span className="font-bold">{player.overall}</span>
                      </span>
                      <span className="text-xs text-blue-600 font-medium">
                        {player.style}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 mt-2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Player Detail Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="bg-red-600 p-4 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Activity size={18} /> 선수 분석
              </h3>
              <button onClick={() => setSelectedPlayer(null)} className="hover:bg-red-700 p-1 rounded-full"><X size={20} /></button>
            </div>
            
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedPlayer.name}</h2>
                  <p className="text-sm text-gray-500 font-medium">{selectedPlayer.style}</p>
                </div>
                <div className="text-center bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                  <div className="text-xs text-red-400 font-bold uppercase">Overall</div>
                  <div className="text-2xl font-black text-red-600">{selectedPlayer.overall}</div>
                </div>
              </div>

              <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <StatBar label="💥 파워 (Power)" value={selectedPlayer.stats.power} color="bg-red-500" />
                <StatBar label="🌪️ 스핀 (Spin)" value={selectedPlayer.stats.spin} color="bg-orange-500" />
                <StatBar label="🎯 컨트롤 (Control)" value={selectedPlayer.stats.control} color="bg-green-500" />
                <StatBar label="🚀 서브 (Serve)" value={selectedPlayer.stats.serve} color="bg-purple-500" />
                <StatBar label="🏃 풋워크 (Footwork)" value={selectedPlayer.stats.footwork} color="bg-blue-500" />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-2 mb-6 items-start">
                <Brain className="text-blue-600 shrink-0 mt-1" size={20} />
                <div className="text-xs text-blue-800 leading-relaxed">
                  <span className="font-bold block mb-1">AI 스카우팅 리포트 (Sonar):</span> 
                  {selectedPlayer.description}
                </div>
              </div>

              <button 
                onClick={() => {
                  handleDeletePlayer(selectedPlayer.id);
                }}
                className="w-full py-3 text-red-500 text-sm font-medium hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={16} /> 선수 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Player Modal */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-xl animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">새 선수 등록</h3>
              <form onSubmit={handleAddPlayer}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input 
                    type="text" 
                    placeholder="예: 김철수" 
                    className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500"
                    value={newPlayerName}
                    onChange={e => setNewPlayerName(e.target.value)}
                    autoFocus
                    disabled={isAnalyzing}
                  />
                </div>

                <div className="space-y-4 mb-6">
                  <p className="text-sm font-bold text-gray-800 border-b pb-2">능력치 설정 (1-10)</p>
                  {[
                    { key: 'power', label: '💥 파워' },
                    { key: 'spin', label: '🌪️ 스핀' },
                    { key: 'control', label: '🎯 컨트롤' },
                    { key: 'serve', label: '🚀 서브' },
                    { key: 'footwork', label: '🏃 풋워크' }
                  ].map((stat) => (
                    <div key={stat.key}>
                      <div className="flex justify-between text-xs mb-1">
                        <label className="text-gray-600">{stat.label}</label>
                        <span className="font-bold text-red-600">{newPlayerStats[stat.key]}</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        step="1"
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                        value={newPlayerStats[stat.key]}
                        onChange={(e) => setNewPlayerStats({...newPlayerStats, [stat.key]: parseInt(e.target.value)})}
                        disabled={isAnalyzing}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowAddPlayer(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-lg hover:bg-gray-200" disabled={isAnalyzing}>취소</button>
                  <button 
                    type="submit" 
                    className={`flex-1 bg-red-600 text-white rounded-lg py-3 font-medium flex items-center justify-center gap-2 ${isAnalyzing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-700'}`}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        AI 분석중...
                      </>
                    ) : (
                      "등록 완료"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderMatches = () => (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">최근 경기 ({matches.length})</h2>
        <button 
          onClick={() => setShowAddMatch(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1 shadow-lg shadow-red-200 active:scale-95 transition-transform"
        >
          <Swords size={16} /> 경기 기록
        </button>
      </div>

      {matches.length === 0 ? (
        <EmptyState message="아직 경기 기록이 없습니다." icon={Swords} />
      ) : (
        <div className="space-y-3">
          {matches.map(match => (
            <div key={match.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex justify-between items-center p-4 relative">
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-blue-500 via-transparent to-red-500 opacity-20"></div>
                
                <div className={`flex-1 text-center ${match.score1 > match.score2 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                  <div className="text-lg">{match.player1Name}</div>
                  <div className={`text-2xl mt-1 ${match.score1 > match.score2 ? 'text-blue-600' : 'text-gray-400'}`}>{match.score1}</div>
                </div>

                <div className="px-2 text-gray-300 text-sm font-mono">VS</div>

                <div className={`flex-1 text-center ${match.score2 > match.score1 ? 'font-bold text-gray-900' : 'text-gray-500'}`}>
                  <div className="text-lg">{match.player2Name}</div>
                  <div className={`text-2xl mt-1 ${match.score2 > match.score1 ? 'text-red-600' : 'text-gray-400'}`}>{match.score2}</div>
                </div>
                
                <button onClick={() => handleDeleteMatch(match.id)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="bg-gray-50 px-4 py-1 text-xs text-gray-400 text-center">
                {match.createdAt?.seconds ? new Date(match.createdAt.seconds * 1000).toLocaleDateString() : '방금 전'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Match Modal */}
      {showAddMatch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold mb-4">경기 결과 입력</h3>
            <form onSubmit={handleAddMatch}>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">선수 1</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2"
                    value={matchForm.p1}
                    onChange={e => setMatchForm({...matchForm, p1: e.target.value})}
                  >
                    <option value="">선택</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">점수</label>
                  <input 
                    type="number" 
                    className="w-full border border-gray-300 rounded-lg p-2 text-center"
                    value={matchForm.s1}
                    onChange={e => setMatchForm({...matchForm, s1: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-center mb-4 text-gray-400 font-bold">VS</div>

              <div className="flex items-center gap-2 mb-6">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">선수 2</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2"
                    value={matchForm.p2}
                    onChange={e => setMatchForm({...matchForm, p2: e.target.value})}
                  >
                    <option value="">선택</option>
                    {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">점수</label>
                  <input 
                    type="number" 
                    className="w-full border border-gray-300 rounded-lg p-2 text-center"
                    value={matchForm.s2}
                    onChange={e => setMatchForm({...matchForm, s2: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowAddMatch(false)} className="flex-1 py-3 text-gray-600 font-medium bg-gray-100 rounded-lg hover:bg-gray-200">취소</button>
                <button type="submit" className="flex-1 bg-red-600 text-white rounded-lg py-3 font-medium hover:bg-red-700">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderRecords = () => (
    <div className="p-4 space-y-4 pb-24">
      <h2 className="text-lg font-bold text-gray-800 mb-4">전체 랭킹</h2>
      {rankings.length === 0 ? (
        <EmptyState message="데이터가 부족합니다." icon={Medal} />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3 text-center">승</th>
                <th className="px-4 py-3 text-center">패</th>
                <th className="px-4 py-3 text-center">승률</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((player, index) => (
                <tr key={player.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-center font-bold text-gray-400">
                    {index === 0 ? <span className="text-yellow-500 text-lg">🥇</span> : 
                     index === 1 ? <span className="text-gray-400 text-lg">🥈</span> :
                     index === 2 ? <span className="text-orange-400 text-lg">🥉</span> : index + 1}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {player.name}
                    {player.overall > 0 && (
                       <span className="block text-[10px] text-gray-400">OVR {player.overall}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-blue-600 font-bold">{player.wins}</td>
                  <td className="px-4 py-3 text-center text-red-500">{player.losses}</td>
                  <td className="px-4 py-3 text-center font-bold">{player.winRate}%</td>
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
      {/* Header */}
      <header className="bg-red-600 text-white p-4 shadow-lg sticky top-0 z-10 flex items-center justify-center relative">
        <div className="flex items-center gap-2">
          <Trophy className="text-yellow-300" />
          <h1 className="text-xl font-bold italic tracking-wider">59전대 탁구왕</h1>
        </div>
      </header>

      {/* Error Message if any */}
      {error && (
        <div className="m-4 p-4 bg-red-100 text-red-700 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="shrink-0 mt-0.5" size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Content Area */}
      <main className="max-w-md mx-auto min-h-[calc(100vh-140px)]">
        {activeTab === 'players' && renderPlayers()}
        {activeTab === 'matches' && renderMatches()}
        {activeTab === 'records' && renderRecords()}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 flex justify-between items-center z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe-bottom">
        <button 
          onClick={() => setActiveTab('players')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'players' ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Users size={24} strokeWidth={activeTab === 'players' ? 2.5 : 2} />
          <span className="text-xs font-medium">선수단</span>
        </button>
        <button 
          onClick={() => setActiveTab('matches')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'matches' ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Swords size={24} strokeWidth={activeTab === 'matches' ? 2.5 : 2} />
          <span className="text-xs font-medium">경기장</span>
        </button>
        <button 
          onClick={() => setActiveTab('records')}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${activeTab === 'records' ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <History size={24} strokeWidth={activeTab === 'records' ? 2.5 : 2} />
          <span className="text-xs font-medium">기록실</span>
        </button>
      </nav>
    </div>
  );
}
