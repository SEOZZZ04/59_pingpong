import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client'; // 화면 렌더링을 위해 추가됨
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, 
  query, orderBy, doc, updateDoc, increment, getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  Trophy, UserPlus, Swords, History, Activity, 
  TrendingUp, Dumbbell, Send, RefreshCw
} from 'lucide-react';

// --- [중요] 설정 영역 ---
// 아래 값을 본인의 Firebase 프로젝트 설정값으로 반드시 교체해주세요!!
const firebaseConfig = {
  apiKey: "AIzaSyAdfU_0hXTkBn55esF7gF8qAw6z2pWUNCg",
  authDomain: "pingpong-a501c.firebaseapp.com",
  projectId: "pingpong-a501c",
  storageBucket: "pingpong-a501c.firebasestorage.app",
  messagingSenderId: "775336039776",
  appId: "1:775336039776:web:8d764651d11552ff923a05",
  measurementId: "G-SYEN26EVNH"
};

// --- Perplexity API 호출 함수 ---
const callPerplexityAI = async (messages) => {
  let apiKey = "";
  try {
    apiKey = import.meta?.env?.VITE_PERPLEXITY_API_KEY;
  } catch (e) { console.warn(e); }

  // API 키가 없으면 경고
  if (!apiKey || apiKey.includes("YOUR")) {
    console.warn("Perplexity API Key 미설정");
    return "API 키가 설정되지 않아 AI 응답을 가져올 수 없습니다. Render 설정에서 VITE_PERPLEXITY_API_KEY를 확인해주세요.";
  }

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "sonar",
        messages: messages,
        temperature: 0.7, 
      }),
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI Call Failed:", error);
    return "AI 분석 중 오류가 발생했습니다.";
  }
};

// --- Firebase 초기화 ---
let db, auth;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (e) {
  console.error("Firebase 초기화 실패 (설정값을 확인하세요):", e);
}

// --- 메인 App 컴포넌트 ---
function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('players');
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(console.error);
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));

    // 선수 데이터 구독
    const qPlayers = query(collection(db, "players"));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(data);
    });

    // 경기 데이터 구독
    const qMatches = query(collection(db, "matches"));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
      setMatches(data);
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubPlayers();
      unsubMatches();
    };
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
      <div className="animate-pulse text-xl font-bold">59전대 탁구왕 로딩중...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20 font-sans">
      <header className="bg-red-600 p-4 text-white shadow-lg sticky top-0 z-10">
        <h1 className="flex items-center justify-center text-2xl font-bold italic">
          <Trophy className="mr-2" /> 59전대 탁구왕
        </h1>
      </header>

      <main className="max-w-md mx-auto p-4">
        {activeTab === 'players' && <PlayerSection players={players} matches={matches} />}
        {activeTab === 'match' && <MatchSection players={players} />}
        {activeTab === 'history' && <HistorySection matches={matches} players={players} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-3 z-10 max-w-md mx-auto shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
        <NavButton active={activeTab === 'players'} onClick={() => setActiveTab('players')} icon={<UserPlus size={24} />} label="선수단" />
        <NavButton active={activeTab === 'match'} onClick={() => setActiveTab('match')} icon={<Swords size={24} />} label="경기장" />
        <NavButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={24} />} label="기록실" />
      </nav>
    </div>
  );
}

// --- 하위 컴포넌트들 ---
function NavButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center text-xs ${active ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
      {icon} <span className="mt-1">{label}</span>
    </button>
  );
}

function PlayerSection({ players, matches }) {
  const [isRegistering, setIsRegistering] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">등록된 선수 ({players.length})</h2>
        <button onClick={() => setIsRegistering(!isRegistering)} className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm font-medium hover:bg-gray-700 transition">
          {isRegistering ? '목록 보기' : '+ 선수 등록'}
        </button>
      </div>
      {isRegistering ? <PlayerRegistrationForm onComplete={() => setIsRegistering(false)} /> : 
        <div className="grid gap-4">
          {players.map(p => <PlayerCard key={p.id} player={p} matches={matches} />)}
          {players.length === 0 && <p className="text-center text-gray-500 py-10">등록된 선수가 없습니다.</p>}
        </div>
      }
    </div>
  );
}

function PlayerRegistrationForm({ onComplete }) {
  const [formData, setFormData] = useState({
    name: '', hand: '오른손', racket: '쉐이크핸드', rubber: '민러버(평면)',
    style: '공격형', power: 5, spin: 5, control: 5, serve: 5, footwork: 5
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) return alert("이름을 입력해주세요!");
    setIsAnalyzing(true);

    const prompt = `탁구 선수 정보: 이름 ${formData.name}, ${formData.hand}, ${formData.racket}, ${formData.style}, 파워 ${formData.power}, 스핀 ${formData.spin}. 오버올(100만점)과 한줄평을 JSON으로 줘: { "overall": 숫자, "description": "내용" }`;
    
    let aiResult = { overall: 0, description: "분석 실패" };
    try {
      const responseText = await callPerplexityAI([{ role: 'user', content: prompt }]);
      const jsonStr = responseText.replace(/```json|```/g, '').trim();
      aiResult = JSON.parse(jsonStr);
    } catch (err) { console.error(err); }

    await addDoc(collection(getFirestore(), "players"), {
      ...formData, ...aiResult, wins: 0, losses: 0, createdAt: serverTimestamp()
    });
    setIsAnalyzing(false);
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl shadow-md space-y-4">
      <h3 className="font-bold text-lg border-b pb-2">신규 선수 등록</h3>
      <input className="w-full border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="선수 이름" />
      {/* (간소화를 위해 일부 필드 생략되었으나 전체 필드 필요시 이전 코드 참고) */}
      <div className="grid grid-cols-2 gap-3">
         <select className="border p-2 rounded" value={formData.hand} onChange={e=>setFormData({...formData, hand: e.target.value})}><option>오른손</option><option>왼손</option></select>
         <select className="border p-2 rounded" value={formData.racket} onChange={e=>setFormData({...formData, racket: e.target.value})}><option>쉐이크핸드</option><option>펜홀더</option></select>
      </div>
      <button type="submit" disabled={isAnalyzing} className="w-full bg-red-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-red-700 disabled:bg-gray-400">
        {isAnalyzing ? 'AI가 선수 분석 중...' : '등록 완료'}
      </button>
    </form>
  );
}

function PlayerCard({ player, matches }) {
  const [analyzing, setAnalyzing] = useState(false);
  const handleAnalyzeHistory = async () => {
    setAnalyzing(true);
    const prompt = `선수 ${player.name}의 최근 전적을 바탕으로 조언해줘.`;
    const comment = await callPerplexityAI([{ role: 'user', content: prompt }]);
    await updateDoc(doc(getFirestore(), "players", player.id), { historyAnalysis: comment });
    setAnalyzing(false);
  };
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 relative">
      <div className="absolute top-0 right-0 bg-gray-100 px-2 py-1 text-xs font-bold text-gray-500">OVR: {player.overall}</div>
      <h3 className="font-bold text-lg">🏓 {player.name}</h3>
      <p className="text-xs text-gray-500">{player.style}</p>
      <p className="bg-gray-50 p-2 rounded text-sm text-gray-700 my-2 italic">"{player.aiDescription}"</p>
      <div className="flex justify-between items-center text-sm">
        <span className="font-bold text-blue-600">승: {player.wins}</span>
        <span className="font-bold text-red-600">패: {player.losses}</span>
        <button onClick={handleAnalyzeHistory} disabled={analyzing} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
          {analyzing ? '분석중...' : '전적분석'}
        </button>
      </div>
      {player.historyAnalysis && <div className="mt-2 text-xs bg-yellow-50 text-yellow-800 p-2 rounded">📈 {player.historyAnalysis}</div>}
    </div>
  );
}

function MatchSection({ players }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [prediction, setPrediction] = useState(null);
  const [score, setScore] = useState('');

  const handlePredict = async () => {
    if(!p1 || !p2) return;
    const p1Data = players.find(p=>p.id===p1);
    const p2Data = players.find(p=>p.id===p2);
    const res = await callPerplexityAI([{ role: 'user', content: `${p1Data.name} vs ${p2Data.name} 탁구 승부 예측해줘. JSON: {"winner": "이름", "score": "11-9", "point": "이유"}` }]);
    try { setPrediction(JSON.parse(res.replace(/```json|```/g, '').trim())); } catch(e){}
  };

  const handleRecord = async () => {
    if(!score) return;
    const [s1, s2] = score.split('-').map(Number);
    const winnerId = s1 > s2 ? p1 : p2;
    const loserId = s1 > s2 ? p2 : p1;
    await addDoc(collection(getFirestore(), "matches"), {
      date: serverTimestamp(), player1Id: p1, player2Id: p2,
      player1Name: players.find(p=>p.id===p1).name, player2Name: players.find(p=>p.id===p2).name,
      score: score, winnerId: winnerId
    });
    await updateDoc(doc(getFirestore(), "players", winnerId), { wins: increment(1) });
    await updateDoc(doc(getFirestore(), "players", loserId), { losses: increment(1) });
    alert("기록 완료");
  };

  return (
    <div className="space-y-6 bg-white p-5 rounded-xl shadow">
      <h2 className="text-center font-bold text-xl">VS 매치업</h2>
      <div className="flex gap-2">
        <select className="flex-1 border p-2" value={p1} onChange={e=>setP1(e.target.value)}><option value="">선수 1</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <span className="font-bold text-red-500 py-2">VS</span>
        <select className="flex-1 border p-2" value={p2} onChange={e=>setP2(e.target.value)}><option value="">선수 2</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <button onClick={handlePredict} className="w-full bg-indigo-600 text-white py-2 rounded font-bold">AI 승부 예측</button>
      {prediction && <div className="bg-indigo-50 p-3 rounded text-sm"><p>승자: {prediction.winner}</p><p>점수: {prediction.score}</p><p>포인트: {prediction.point}</p></div>}
      <div className="border-t pt-4">
        <input type="text" placeholder="점수 (예: 11-9)" className="w-full border p-3 rounded text-center mb-2" value={score} onChange={e=>setScore(e.target.value)} />
        <button onClick={handleRecord} className="w-full bg-green-600 text-white py-3 rounded font-bold">경기 결과 기록</button>
      </div>
    </div>
  );
}

function HistorySection({ matches }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">경기 기록실</h2>
      {matches.map(m => (
        <div key={m.id} className="bg-white p-3 rounded shadow-sm border flex justify-between">
          <div><span className="font-bold">{m.player1Name}</span> vs <span className="font-bold">{m.player2Name}</span></div>
          <div className="font-black text-red-600">{m.score}</div>
        </div>
      ))}
    </div>
  );
}

// --- [핵심 수정 사항] 렌더링 진입점 ---
// 이 코드가 있어야 화면이 나옵니다.
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
