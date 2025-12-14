import React, { useState, useEffect } from 'react';
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

// --- 설정 영역 ---

// 1. Firebase 설정 (Firebase 콘솔에서 복사해서 채워넣으세요)
const firebaseConfig = {
  apiKey: "AIzaSyAdfU_0hXTkBn55esF7gF8qAw6z2pWUNCg",
  authDomain: "pingpong-a501c.firebaseapp.com",
  projectId: "pingpong-a501c",
  storageBucket: "pingpong-a501c.firebasestorage.app",
  messagingSenderId: "775336039776",
  appId: "1:775336039776:web:8d764651d11552ff923a05",
  measurementId: "G-SYEN26EVNH"
};

// 2. Perplexity API 호출 함수
// Render 배포 시 환경변수(VITE_PERPLEXITY_API_KEY) 설정을 잊지 마세요.
const callPerplexityAI = async (messages) => {
  // import.meta 오류 방지를 위한 단순화된 접근 방식
  let apiKey = "";
  try {
    // Vite 환경 변수 접근 (옵셔널 체이닝 사용)
    apiKey = import.meta?.env?.VITE_PERPLEXITY_API_KEY;
  } catch (e) {
    console.warn("환경 변수 로드 실패:", e);
  }

  // 폴백 키 설정
  apiKey = apiKey || "YOUR_TEST_KEY_IF_NEEDED";
  
  if (!apiKey || apiKey.includes("YOUR")) {
    console.warn("Perplexity API Key가 설정되지 않았습니다.");
    return "API 키가 설정되지 않아 AI 응답을 가져올 수 없습니다. 환경변수를 확인해주세요.";
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

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("AI Call Failed:", error);
    return "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
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

// --- 메인 컴포넌트 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('players'); // players, match, history
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // 초기 인증 및 데이터 로드
  useEffect(() => {
    if (!auth) return;
    
    // 1. 익명 로그인 (누구나 쓰기 위해)
    signInAnonymously(auth).catch(console.error);
    
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    // 2. 선수 데이터 실시간 구독
    const qPlayers = query(collection(db, "players"));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPlayers(data);
    });

    // 3. 경기 기록 실시간 구독
    const qMatches = query(collection(db, "matches"));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // 날짜 내림차순 정렬
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
      {/* 헤더 */}
      <header className="bg-red-600 p-4 text-white shadow-lg sticky top-0 z-10">
        <h1 className="flex items-center justify-center text-2xl font-bold italic">
          <Trophy className="mr-2" /> 59전대 탁구왕
        </h1>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <main className="max-w-md mx-auto p-4">
        {activeTab === 'players' && <PlayerSection players={players} matches={matches} />}
        {activeTab === 'match' && <MatchSection players={players} />}
        {activeTab === 'history' && <HistorySection matches={matches} players={players} />}
      </main>

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-3 z-10 max-w-md mx-auto shadow-[0_-5px_10px_rgba(0,0,0,0.05)]">
        <NavButton 
          active={activeTab === 'players'} 
          onClick={() => setActiveTab('players')} 
          icon={<UserPlus size={24} />} 
          label="선수단" 
        />
        <NavButton 
          active={activeTab === 'match'} 
          onClick={() => setActiveTab('match')} 
          icon={<Swords size={24} />} 
          label="경기장" 
        />
        <NavButton 
          active={activeTab === 'history'} 
          onClick={() => setActiveTab('history')} 
          icon={<History size={24} />} 
          label="기록실" 
        />
      </nav>
    </div>
  );
}

// --- 하위 컴포넌트들 ---

function NavButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick} 
      className={`flex flex-col items-center text-xs ${active ? 'text-red-600 font-bold' : 'text-gray-400'}`}
    >
      {icon}
      <span className="mt-1">{label}</span>
    </button>
  );
}

// 1. 선수 관리 섹션
function PlayerSection({ players, matches }) {
  const [isRegistering, setIsRegistering] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">등록된 선수 ({players.length})</h2>
        <button 
          onClick={() => setIsRegistering(!isRegistering)}
          className="bg-gray-800 text-white px-3 py-1 rounded-full text-sm font-medium hover:bg-gray-700 transition"
        >
          {isRegistering ? '목록 보기' : '+ 선수 등록'}
        </button>
      </div>

      {isRegistering ? (
        <PlayerRegistrationForm onComplete={() => setIsRegistering(false)} />
      ) : (
        <div className="grid gap-4">
          {players.map(p => (
            <PlayerCard key={p.id} player={p} matches={matches} />
          ))}
          {players.length === 0 && <p className="text-center text-gray-500 py-10">등록된 선수가 없습니다.</p>}
        </div>
      )}
    </div>
  );
}

function PlayerRegistrationForm({ onComplete }) {
  const [formData, setFormData] = useState({
    name: '',
    hand: '오른손',
    racket: '쉐이크핸드',
    rubber: '민러버(평면)',
    style: '공격형',
    power: 5,
    spin: 5,
    control: 5,
    serve: 5,
    footwork: 5
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) return alert("이름을 입력해주세요!");
    
    setIsAnalyzing(true);

    // AI에게 오버올 및 평가 요청
    const prompt = `
      탁구 선수 정보:
      이름: ${formData.name}
      주손: ${formData.hand}, 라켓: ${formData.racket}, 러버: ${formData.rubber}, 전형: ${formData.style}
      능력치(1-10): 파워(${formData.power}), 스핀(${formData.spin}), 컨트롤(${formData.control}), 서브(${formData.serve}), 풋워크(${formData.footwork})
      
      이 정보를 바탕으로 다음을 수행해:
      1. 이 선수의 종합 오버올 점수(100점 만점)를 계산해.
      2. 이 선수의 플레이 스타일과 장단점을 분석해서 한 문단으로 설명해.
      
      응답 형식(JSON만 출력):
      { "overall": 숫자, "description": "설명 텍스트" }
    `;

    let aiResult = { overall: 0, description: "분석 실패" };
    try {
      const responseText = await callPerplexityAI([{ role: 'user', content: prompt }]);
      // JSON 파싱 시도
      const jsonStr = responseText.replace(/```json|```/g, '').trim();
      aiResult = JSON.parse(jsonStr);
    } catch (err) {
      console.error("AI Parsing Error", err);
      aiResult = { overall: 50, description: "AI 분석에 실패하여 기본값이 설정되었습니다." };
    }

    // Firebase 저장
    await addDoc(collection(getFirestore(), "players"), {
      ...formData,
      overall: aiResult.overall,
      aiDescription: aiResult.description,
      wins: 0,
      losses: 0,
      createdAt: serverTimestamp()
    });

    setIsAnalyzing(false);
    onComplete();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-xl shadow-md space-y-4">
      <h3 className="font-bold text-lg border-b pb-2">신규 선수 등록</h3>
      
      <div>
        <label className="block text-sm font-medium text-gray-700">이름</label>
        <input 
          className="w-full border p-2 rounded mt-1" 
          value={formData.name} 
          onChange={e => setFormData({...formData, name: e.target.value})}
          placeholder="선수 이름"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SelectField label="주손" value={formData.hand} options={['오른손', '왼손']} onChange={v => setFormData({...formData, hand: v})} />
        <SelectField label="라켓" value={formData.racket} options={['쉐이크핸드', '펜홀더', '중펜']} onChange={v => setFormData({...formData, racket: v})} />
        <SelectField label="러버" value={formData.rubber} options={['민러버(평면)', '숏핌플', '롱핌플', '안티스핀']} onChange={v => setFormData({...formData, rubber: v})} />
        <SelectField label="전형" value={formData.style} options={['공격형', '수비형', '올라운드', '변칙형']} onChange={v => setFormData({...formData, style: v})} />
      </div>

      <div className="space-y-3 pt-2 border-t">
        <p className="text-sm font-bold text-gray-600">능력치 (1-10)</p>
        <SliderField label="파워 (Power)" value={formData.power} onChange={v => setFormData({...formData, power: v})} />
        <SliderField label="스핀 (Spin)" value={formData.spin} onChange={v => setFormData({...formData, spin: v})} />
        <SliderField label="컨트롤 (Control)" value={formData.control} onChange={v => setFormData({...formData, control: v})} />
        <SliderField label="서브 (Serve)" value={formData.serve} onChange={v => setFormData({...formData, serve: v})} />
        <SliderField label="풋워크 (Footwork)" value={formData.footwork} onChange={v => setFormData({...formData, footwork: v})} />
      </div>

      <button 
        type="submit" 
        disabled={isAnalyzing}
        className="w-full bg-red-600 text-white py-3 rounded-lg font-bold shadow-md hover:bg-red-700 disabled:bg-gray-400 transition"
      >
        {isAnalyzing ? 'AI가 선수 분석 중...' : '등록 및 AI 분석 시작'}
      </button>
    </form>
  );
}

function PlayerCard({ player, matches }) {
  const [analyzing, setAnalyzing] = useState(false);

  // 전적 분석 기능
  const handleAnalyzeHistory = async () => {
    setAnalyzing(true);
    // 이 선수와 관련된 최근 경기 추출
    const myMatches = matches.filter(m => m.player1Id === player.id || m.player2Id === player.id).slice(0, 5);
    
    if (myMatches.length === 0) {
      alert("분석할 경기 기록이 없습니다.");
      setAnalyzing(false);
      return;
    }

    const matchSummary = myMatches.map(m => {
      const isP1 = m.player1Id === player.id;
      const result = m.winnerId === player.id ? "승리" : "패배";
      // isP1 ? m.player2Name : m.player1Name -> 상대방 이름
      return `날짜: ${new Date(m.date?.seconds * 1000).toLocaleDateString()}, 결과: ${result}, 점수: ${m.score}`;
    }).join("\n");

    const prompt = `
      선수 이름: ${player.name}
      최근 전적 기록:
      ${matchSummary}
      
      이 기록을 바탕으로 이 선수의 최근 경기력 추세와 보완점을 2문장으로 요약해줘.
    `;

    const comment = await callPerplexityAI([{ role: 'user', content: prompt }]);
    
    // Firestore 업데이트
    await updateDoc(doc(getFirestore(), "players", player.id), {
      historyAnalysis: comment
    });
    setAnalyzing(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 relative overflow-hidden">
      <div className="absolute top-0 right-0 bg-gray-100 px-2 py-1 rounded-bl-lg text-xs font-bold text-gray-500">
        OVR: {player.overall || '?'}
      </div>
      <div className="flex items-center space-x-3 mb-2">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-xl">🏓</div>
        <div>
          <h3 className="font-bold text-lg">{player.name}</h3>
          <p className="text-xs text-gray-500">{player.hand} / {player.racket} / {player.style}</p>
        </div>
      </div>
      
      <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-700 mb-3">
        <p className="line-clamp-3 italic">"{player.aiDescription}"</p>
      </div>

      <div className="flex justify-between items-center text-sm mb-3">
        <span className="font-bold text-blue-600">승: {player.wins}</span>
        <span className="font-bold text-red-600">패: {player.losses}</span>
        <span className="text-gray-400">|</span>
        <button 
          onClick={handleAnalyzeHistory}
          disabled={analyzing}
          className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded flex items-center gap-1"
        >
          {analyzing ? <RefreshCw className="animate-spin w-3 h-3" /> : <Activity className="w-3 h-3" />}
          전적 정밀분석
        </button>
      </div>

      {player.historyAnalysis && (
        <div className="mt-2 text-xs bg-yellow-50 text-yellow-800 p-2 rounded border border-yellow-100">
          <span className="font-bold">📈 최근 분석:</span> {player.historyAnalysis}
        </div>
      )}
    </div>
  );
}

// 2. 경기장 섹션
function MatchSection({ players }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [rule, setRule] = useState('11점 단세트');
  const [prediction, setPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [matchScore, setMatchScore] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handlePredict = async () => {
    if (!p1 || !p2 || p1 === p2) return alert("두 명의 다른 선수를 선택해주세요.");
    
    setPredicting(true);
    const player1 = players.find(p => p.id === p1);
    const player2 = players.find(p => p.id === p2);

    const prompt = `
      매치업: ${player1.name} (Overall ${player1.overall}, ${player1.style}) vs ${player2.name} (Overall ${player2.overall}, ${player2.style})
      경기 방식: ${rule}
      
      두 선수의 능력치와 스타일을 고려하여 다음을 예측해줘:
      1. 예상 승자
      2. 예상 스코어
      3. 관전 포인트 (한 문장)
      
      형식: JSON { "winner": "이름", "score": "11-9", "point": "..." }
    `;

    try {
      const res = await callPerplexityAI([{ role: 'user', content: prompt }]);
      const jsonStr = res.replace(/```json|```/g, '').trim();
      setPrediction(JSON.parse(jsonStr));
    } catch (e) {
      setPrediction({ winner: "?", score: "?-?", point: "AI 예측 실패" });
    }
    setPredicting(false);
  };

  const handleRecordMatch = async () => {
    if (!matchScore) return alert("스코어를 입력해주세요.");
    setSubmitting(true);
    
    const [s1, s2] = matchScore.split('-').map(Number);
    let winnerId = null;
    let loserId = null;

    if (isNaN(s1) || isNaN(s2)) {
      alert("점수 형식이 올바르지 않습니다. (예: 11-9)");
      setSubmitting(false);
      return;
    }

    if (s1 > s2) { winnerId = p1; loserId = p2; }
    else if (s2 > s1) { winnerId = p2; loserId = p1; }
    else {
      alert("무승부는 기록할 수 없습니다.");
      setSubmitting(false);
      return;
    }
    
    const p1Name = players.find(p => p.id === p1).name;
    const p2Name = players.find(p => p.id === p2).name;

    try {
      // 1. 매치 기록 저장
      await addDoc(collection(getFirestore(), "matches"), {
        date: serverTimestamp(),
        player1Id: p1,
        player1Name: p1Name,
        player2Id: p2,
        player2Name: p2Name,
        score: matchScore,
        rule: rule,
        winnerId: winnerId
      });

      // 2. 승패 카운트 업데이트
      await updateDoc(doc(getFirestore(), "players", winnerId), { wins: increment(1) });
      await updateDoc(doc(getFirestore(), "players", loserId), { losses: increment(1) });

      alert("경기 기록 저장 완료!");
      setMatchScore('');
      setPrediction(null);
    } catch (e) {
      console.error(e);
      alert("저장 실패");
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-xl shadow-lg">
        <h2 className="text-center font-bold text-xl mb-4 text-gray-800">VS 매치업</h2>
        <div className="flex items-center justify-between gap-2 mb-4">
          <select className="flex-1 p-2 border rounded text-sm" value={p1} onChange={e => setP1(e.target.value)}>
            <option value="">선수 1 선택</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="font-black text-red-500">VS</span>
          <select className="flex-1 p-2 border rounded text-sm" value={p2} onChange={e => setP2(e.target.value)}>
            <option value="">선수 2 선택</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        
        <div className="mb-4">
          <label className="text-xs font-bold text-gray-500 mb-1 block">경기 방식</label>
          <select className="w-full p-2 border rounded" value={rule} onChange={e => setRule(e.target.value)}>
            <option>11점 단세트</option>
            <option>21점 단세트</option>
            <option>3판 2선승제</option>
            <option>5판 3선승제</option>
          </select>
        </div>

        <button 
          onClick={handlePredict}
          disabled={predicting || !p1 || !p2}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition flex justify-center items-center gap-2"
        >
          {predicting ? 'AI 분석 중...' : <><TrendingUp size={18} /> AI 승부 예측</>}
        </button>

        {prediction && (
          <div className="mt-4 bg-indigo-50 p-3 rounded border border-indigo-100 text-sm">
            <p><span className="font-bold text-indigo-700">예상 승자:</span> {prediction.winner}</p>
            <p><span className="font-bold text-indigo-700">예상 스코어:</span> {prediction.score}</p>
            <p className="mt-1 text-gray-600 text-xs">💡 {prediction.point}</p>
          </div>
        )}
      </div>

      {/* 결과 입력 카드 */}
      <div className="bg-white p-5 rounded-xl shadow border border-gray-200">
        <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
          <Send size={16} /> 경기 결과 기록
        </h3>
        <input 
          type="text" 
          placeholder="점수 입력 (예: 11-9)" 
          className="w-full border p-3 rounded-lg text-lg text-center tracking-widest mb-3"
          value={matchScore}
          onChange={e => setMatchScore(e.target.value)}
        />
        <button 
          onClick={handleRecordMatch}
          disabled={submitting}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700"
        >
          기록 저장 및 전적 반영
        </button>
      </div>
    </div>
  );
}

// 3. 기록실 섹션
function HistorySection({ matches }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
        <History /> 경기 기록실
      </h2>
      <div className="space-y-3">
        {matches.map(m => (
          <div key={m.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center">
            <div>
              <div className="text-sm font-bold text-gray-800">
                {m.player1Name} <span className="text-gray-400 text-xs">vs</span> {m.player2Name}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(m.date?.seconds * 1000).toLocaleDateString()} · {m.rule}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-black text-red-600">{m.score}</div>
              {m.winnerId && (
                <div className="text-xs text-green-600 font-bold">
                  {m.player1Id === m.winnerId ? m.player1Name : m.player2Name} 승
                </div>
              )}
            </div>
          </div>
        ))}
        {matches.length === 0 && <p className="text-center text-gray-400 py-10">아직 기록된 경기가 없습니다.</p>}
      </div>
    </div>
  );
}

// UI 헬퍼 컴포넌트
function SelectField({ label, value, options, onChange }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs font-bold text-gray-500 mb-1">{label}</label>
      <select className="border p-2 rounded text-sm" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SliderField({ label, value, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="font-bold text-red-600">{value}</span>
      </div>
      <input 
        type="range" min="1" max="10" step="1" 
        value={value} 
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-red-600"
      />
    </div>
  );
}
