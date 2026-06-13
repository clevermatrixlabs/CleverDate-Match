import { useEffect, useState } from 'react';

const quotes = [
  "Where real love begins...",
  "One match. One story.",
  "Verified love awaits.",
  "Your journey starts here.",
];

export function AppLoading() {
  const [quote, setQuote] = useState(quotes[0]);

  useEffect(() => {
    const i = Math.floor(Math.random() * quotes.length);
    setQuote(quotes[i]);
  }, []);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(170deg, #040810 0%, #0a0f1e 35%, #0d1535 100%)' }}
    >
      <div style={{
        position:'absolute', top:'35%', left:'50%', transform:'translate(-50%,-50%)',
        width:300, height:300,
        background:'radial-gradient(circle, rgba(21,101,192,0.2) 0%, transparent 70%)',
        borderRadius:'50%',
        pointerEvents:'none',
      }} />

      <div style={{ textAlign:'center', position:'relative', zIndex:1 }}>
        <div style={{ lineHeight:1, marginBottom:4 }}>
          <span style={{
            fontFamily:"'Georgia','Times New Roman',serif",
            fontSize:'clamp(72px,18vw,110px)',
            fontWeight:900,
            fontStyle:'italic',
            background:'linear-gradient(135deg,#ffd700 0%,#ff9500 40%,#ffec6e 70%,#ffd700 100%)',
            backgroundSize:'200% auto',
            WebkitBackgroundClip:'text',
            WebkitTextFillColor:'transparent',
            backgroundClip:'text',
            display:'inline-block',
            filter:'drop-shadow(0 0 30px rgba(255,200,50,0.5))',
          }}>C</span>
        </div>
        <div style={{ marginTop:-8, marginBottom:24 }}>
          <span style={{
            fontFamily:"'Georgia','Times New Roman',serif",
            fontSize:'clamp(16px,4vw,24px)',
            fontWeight:700,
            fontStyle:'italic',
            letterSpacing:'0.1em',
            color:'rgba(255,255,255,0.75)',
            textTransform:'uppercase',
            display:'block',
          }}>LEVER DATE MATCH</span>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:20 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:8, height:8, borderRadius:'50%',
              background:'rgba(255,200,70,0.7)',
              animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite`,
            }} />
          ))}
        </div>

        <p style={{ color:'rgba(255,255,255,0.35)', fontSize:13, letterSpacing:'0.1em', textTransform:'uppercase' }}>
          {quote}
        </p>
      </div>

      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
    </div>
  );
}
