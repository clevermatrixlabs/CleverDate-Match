import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, Eye, EyeOff, ArrowLeft, Globe, KeyRound, ShieldCheck } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRIES, detectCountryFromIP } from '@/lib/countries';
import { useGoogleLogin } from '@react-oauth/google';
import { apiRequest } from '@/lib/queryClient';
import { User } from '@/types';
import {
  createFirebasePhoneChallenge,
  confirmFirebasePhoneCode,
  isFirebaseConfigured,
  reloadFirebaseUser,
  normalizePhoneNumber,
  toFriendlyAuthError,
} from '@/lib/firebase';
import type { ConfirmationResult } from 'firebase/auth';

/* ── Feature flags ─────────────────────────────────────────────────────────── */
const GOOGLE_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Phone sign-up disabled at launch (SMS cost). Phone sign-in kept for existing users.
const PHONE_SIGNUP_ENABLED = true;

type Screen =
  | 'welcome'
  | 'choose-method'
  | 'email-login'
  | 'email-signup'
  | 'phone-login'
  | 'phone-signup'
  | 'otp'
  | 'verify-email'
  | 'forgot-password';

/* ── Schemas ─────────────────────────────────────────────────────────────────── */
const emailLoginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
const emailSignupSchema = z.object({
  email: z.string().email('Please enter a valid Gmail or email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  country: z.string().min(2, 'Please select your country'),
}).refine(d => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });
const phoneSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter phone with country code e.g. +1234567890'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  country: z.string().min(2, 'Please select your country'),
}).refine(d => d.password === d.confirmPassword, { message: "Passwords don't match", path: ['confirmPassword'] });
const phoneLoginSchema = z.object({
  phone: z.string().min(5, 'Enter your phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
const otpSchema = z.object({ otp: z.string().length(6, 'Enter the 6-digit code') });
const forgotPasswordSchema = z.object({ email: z.string().email('Please enter your email address') });

/* ── Google multicolor G icon (official brand SVG) ───────────────────────── */
function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

/* ── Real Google OAuth button (only rendered when GoogleOAuthProvider is present) */
function GoogleSignInButton({ isLogin, onSuccess, onError }: {
  isLogin: boolean;
  onSuccess: (accessToken: string) => void;
  onError: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setLoading(false);
      onSuccess(tokenResponse.access_token);
    },
    onError: () => { setLoading(false); onError(); },
  });

  return (
    <button
      onClick={() => { setLoading(true); login(); }}
      disabled={loading}
      className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm disabled:opacity-60"
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      ) : (
        <GoogleIcon size={22} />
      )}
      <span className="font-semibold text-gray-700 text-[15px]">
        {loading ? 'Opening Google…' : isLogin ? 'Continue with Google' : 'Sign up with Google'}
      </span>
    </button>
  );
}

/* ── Animated background particles ─────────────────────────────────────────── */
function Particle({ style }: { style: React.CSSProperties }) {
  return <div className="absolute rounded-full pointer-events-none" style={style} />;
}
function CinematicBg() {
  const particles = [
    { width:6, height:6, top:'12%', left:'8%', background:'rgba(255,200,80,0.55)', filter:'blur(1px)', animation:'float1 7s ease-in-out infinite' },
    { width:10, height:10, top:'22%', left:'78%', background:'rgba(255,100,150,0.45)', filter:'blur(2px)', animation:'float2 9s ease-in-out infinite' },
    { width:4, height:4, top:'55%', left:'15%', background:'rgba(180,140,255,0.6)', filter:'blur(1px)', animation:'float3 6s ease-in-out infinite' },
    { width:8, height:8, top:'70%', left:'85%', background:'rgba(255,200,80,0.4)', filter:'blur(2px)', animation:'float1 8s ease-in-out infinite 1s' },
    { width:5, height:5, top:'38%', left:'92%', background:'rgba(100,200,255,0.5)', filter:'blur(1px)', animation:'float2 10s ease-in-out infinite 2s' },
    { width:14, height:14, top:'80%', left:'30%', background:'rgba(255,120,80,0.3)', filter:'blur(3px)', animation:'float3 12s ease-in-out infinite 0.5s' },
    { width:3, height:3, top:'10%', left:'55%', background:'rgba(255,255,255,0.7)', filter:'blur(0.5px)', animation:'float1 5s ease-in-out infinite 3s' },
    { width:7, height:7, top:'45%', left:'45%', background:'rgba(255,200,80,0.35)', filter:'blur(2px)', animation:'float2 11s ease-in-out infinite 1.5s' },
  ];
  return <>{particles.map((p, i) => <Particle key={i} style={p} />)}</>;
}

export default function OnboardingPage() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const phoneRecaptchaCleanup = useRef<(() => void) | null>(null);

  const { loginWithEmail, loginWithPhone, loginWithGoogle, registerWithEmail,
    forgotPassword, completeAuth } = useAuth();
  const { toast } = useToast();

  /* ── Forms ── */
  const emailLoginForm = useForm({ resolver: zodResolver(emailLoginSchema), defaultValues: { email: '', password: '' } });
  const emailSignupForm = useForm({
    resolver: zodResolver(emailSignupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', country: '' },
  });
  const phoneForm = useForm({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '', password: '', confirmPassword: '', country: '' } });
  const phoneLoginForm = useForm({ resolver: zodResolver(phoneLoginSchema), defaultValues: { phone: '', password: '' } });
  const otpForm = useForm({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });
  const forgotForm = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  useEffect(() => () => {
    phoneRecaptchaCleanup.current?.();
    phoneRecaptchaCleanup.current = null;
  }, []);

  /* Auto-detect country on mount */
  const [countryDetected, setCountryDetected] = useState(false);
  if (!countryDetected) {
    setCountryDetected(true);
    detectCountryFromIP().then(code => {
      if (!code) return;
      if (!emailSignupForm.getValues('country')) emailSignupForm.setValue('country', code);
      if (!phoneForm.getValues('country')) phoneForm.setValue('country', code);
    });
  }

  /* ── Handlers ── */
  const handleEmailLogin = async (data: z.infer<typeof emailLoginSchema>) => {
    try { await loginWithEmail(data.email, data.password); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Login failed', description: toFriendlyAuthError(e).message }); }
  };

  const handleEmailSignup = async (data: z.infer<typeof emailSignupSchema>) => {
    try {
      const user = await registerWithEmail(data.email, data.password, data.country);
      setPendingUser(user);
      // Firebase sent a real verification link; wait for the user to confirm it.
      setScreen('verify-email');
      toast({ title: 'Account created!', description: 'Check your inbox for your Clever Date Match verification link.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Registration failed', description: toFriendlyAuthError(e).message });
    }
  };

  const handleVerifyEmail = async () => {
    try {
      if (!isFirebaseConfigured()) throw new Error('Verification is not available right now. Please try again later.');
      const firebaseUser = await reloadFirebaseUser();
      if (!firebaseUser.emailVerified) throw new Error('The email link has not been confirmed yet. Open it, then try again.');
      const updated = await apiRequest('POST', '/auth/firebase/sync', {
        idToken: await firebaseUser.getIdToken(true),
      }) as User;
      completeAuth(updated);
      toast({ title: 'Email verified!', description: 'Welcome to Clever Date Match.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Verification failed', description: toFriendlyAuthError(e, 'We could not confirm your email yet. Please open the link in your inbox and try again.').message });
    }
  };

  const handleResendEmailCode = async () => {
    try {
      const { resendFirebaseEmailVerification } = await import('@/lib/firebase');
      await resendFirebaseEmailVerification();
      toast({ title: 'Verification link sent', description: 'Check your inbox for a new Clever Date Match email.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not resend', description: toFriendlyAuthError(e, 'We could not resend the link just now. Please try again.').message });
    }
  };

  const handlePhoneSignup = async (data: z.infer<typeof phoneSchema>) => {
    await handleSendOtp(data.phone, data.country);
  };

  const handlePhoneLogin = async (data: z.infer<typeof phoneLoginSchema>) => {
    try { await loginWithPhone(data.phone, data.password); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Login failed', description: toFriendlyAuthError(e).message }); }
  };

  const handleSendOtp = async (phone: string, country?: string) => {
    try {
      if (!isFirebaseConfigured()) throw new Error('Phone verification is not available right now. Please try again later.');
      const normalizedPhone = normalizePhoneNumber(phone, country);
      if (!/^\+[1-9]\d{6,14}$/.test(normalizedPhone)) {
        throw new Error("That phone number doesn't look right — please check the number and try again.");
      }
      const challenge = createFirebasePhoneChallenge(normalizedPhone, 'firebase-recaptcha');
      phoneRecaptchaCleanup.current = challenge.cleanup;
      const confirmation = await challenge.confirmation;
      setPhoneConfirmation(confirmation);
      setPendingPhone(normalizedPhone); setScreen('otp');
      if (country) phoneForm.setValue('country', country);
      phoneForm.setValue('phone', normalizedPhone);
      toast({ title: 'SMS sent', description: `A verification code was sent to ${normalizedPhone}` });
    } catch (e: any) {
      phoneRecaptchaCleanup.current?.();
      phoneRecaptchaCleanup.current = null;
      toast({ variant: 'destructive', title: 'Could not send your code', description: toFriendlyAuthError(e, 'Something went wrong sending your code — please try again.').message });
    }
  };

  const handleVerifyOtp = async (data: z.infer<typeof otpSchema>) => {
    try {
      if (!phoneConfirmation) throw new Error('Your SMS session expired. Please request a new code.');
      const firebaseUser = await confirmFirebasePhoneCode(phoneConfirmation, data.otp);
      const localUser = await apiRequest('POST', '/auth/firebase/sync', {
        idToken: await firebaseUser.getIdToken(),
        country: phoneForm.getValues('country'),
        intent: 'signup',
      }) as User;
      phoneRecaptchaCleanup.current?.();
      setPhoneConfirmation(null);
      completeAuth(localUser);
    }
    catch (e: any) { toast({ variant: 'destructive', title: 'That code did not work', description: toFriendlyAuthError(e, 'That code is not correct. Please check it and try again.').message }); }
  };

  const handleGoogleSuccess = async (accessToken: string) => {
    try { await loginWithGoogle(accessToken); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Google sign-in failed', description: toFriendlyAuthError(e, 'Could not connect to Google. Try email instead.').message }); }
  };

  const handleForgotPassword = async (data: z.infer<typeof forgotPasswordSchema>) => {
    try {
      await forgotPassword(data.email);
      toast({ title: 'Reset link sent', description: 'Check your inbox for your Clever Date Match password reset link.' });
      setScreen('email-login');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Could not send reset link', description: toFriendlyAuthError(e, 'We could not send the reset link just now. Please try again.').message });
    }
  };

  const back = () => {
    if (screen === 'otp') {
      phoneRecaptchaCleanup.current?.();
      phoneRecaptchaCleanup.current = null;
      setPhoneConfirmation(null);
      return setScreen('phone-login');
    }
    if (screen === 'verify-email') return setScreen('choose-method');
    if (screen === 'forgot-password') return setScreen('email-login');
    setScreen('choose-method');
  };

  /* ════════════════════════════════════════════════════════════════════════════
     WELCOME SCREEN — full cinematic
  ════════════════════════════════════════════════════════════════════════════ */
  if (screen === 'welcome') {
    return (
      <>
        <style>{`
          @keyframes float1 { 0%,100%{transform:translateY(0px) scale(1)} 50%{transform:translateY(-18px) scale(1.1)} }
          @keyframes float2 { 0%,100%{transform:translateY(0px) rotate(0deg)} 50%{transform:translateY(-12px) rotate(20deg)} }
          @keyframes float3 { 0%,100%{transform:translateY(0px)} 33%{transform:translateY(-8px)} 66%{transform:translateY(4px)} }
          @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
          @keyframes glow { 0%,100%{text-shadow:0 0 30px rgba(255,195,70,0.6),0 0 60px rgba(255,150,50,0.3)} 50%{text-shadow:0 0 50px rgba(255,220,100,0.9),0 0 100px rgba(255,180,60,0.5)} }
        `}</style>
        <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background:'linear-gradient(170deg,#040810 0%,#0a0f1e 35%,#0d1535 60%,#0a0f22 100%)' }}>
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{ position:'absolute', top:'-10%', left:'30%', width:'420px', height:'420px', background:'radial-gradient(circle,rgba(21,101,192,0.25) 0%,transparent 70%)', borderRadius:'50%' }} />
            <div style={{ position:'absolute', top:'30%', right:'-15%', width:'350px', height:'350px', background:'radial-gradient(circle,rgba(180,50,120,0.18) 0%,transparent 70%)', borderRadius:'50%' }} />
            <div style={{ position:'absolute', bottom:'-5%', left:'-10%', width:'300px', height:'300px', background:'radial-gradient(circle,rgba(100,60,200,0.15) 0%,transparent 70%)', borderRadius:'50%' }} />
            <CinematicBg />
          </div>

          <div className="flex justify-center pt-14" style={{ animation:'fadeUp 0.8s ease both' }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:'6px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'100px', padding:'6px 18px', backdropFilter:'blur(10px)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#e53935', display:'inline-block', boxShadow:'0 0 8px #e53935' }} />
              <span style={{ color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:600, letterSpacing:2, textTransform:'uppercase' }}>International · Verified · Exclusive</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ animation:'fadeUp 1s ease 0.2s both' }}>
            <div style={{ marginBottom:8, lineHeight:1 }}>
              <span style={{ fontFamily:"'Georgia','Times New Roman',serif", fontSize:'clamp(100px,22vw,160px)', fontWeight:900, fontStyle:'italic', background:'linear-gradient(135deg,#ffd700 0%,#ff9500 40%,#ffec6e 70%,#ffd700 100%)', backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', animation:'glow 3s ease-in-out infinite,shimmer 4s linear infinite', display:'inline-block', filter:'drop-shadow(0 0 40px rgba(255,200,50,0.4))' }}>C</span>
            </div>
            <div style={{ marginTop:-16, marginBottom:20 }}>
              <span style={{ fontFamily:"'Georgia','Times New Roman',serif", fontSize:'clamp(28px,7vw,48px)', fontWeight:700, fontStyle:'italic', letterSpacing:'0.08em', background:'linear-gradient(90deg,#ffffff 0%,rgba(255,255,255,0.75) 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', display:'block', textTransform:'uppercase' }}>LEVER DATE MATCH</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <div style={{ width:60, height:1, background:'linear-gradient(90deg,transparent,rgba(255,200,70,0.5))' }} />
              <span style={{ color:'rgba(255,200,70,0.7)', fontSize:18 }}>♥</span>
              <div style={{ width:60, height:1, background:'linear-gradient(90deg,rgba(255,200,70,0.5),transparent)' }} />
            </div>
            <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'clamp(13px,3.5vw,16px)', letterSpacing:'0.15em', textTransform:'uppercase', fontWeight:400, marginBottom:56, maxWidth:280 }}>
              Real People · Verified Love · One Match at a Time
            </p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:56 }}>
              {['🛡️ AI Verified','💎 One Match Only','🌍 International','⭐ Smart AI Match'].map((f,i) => (
                <span key={i} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:100, padding:'7px 16px', color:'rgba(255,255,255,0.65)', fontSize:12, fontWeight:500, backdropFilter:'blur(8px)', animation:`fadeUp 0.8s ease ${0.4+i*0.1}s both` }}>{f}</span>
              ))}
            </div>
            <div style={{ width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:14, animation:'fadeUp 1s ease 0.8s both' }}>
              <button
                onClick={() => { setIsLogin(false); setScreen('choose-method'); }}
                style={{ width:'100%', height:58, background:'linear-gradient(135deg,#ffd700 0%,#ff9500 100%)', border:'none', borderRadius:16, cursor:'pointer', fontSize:16, fontWeight:700, color:'#000', letterSpacing:'0.05em', boxShadow:'0 8px 32px rgba(255,180,0,0.4),0 2px 8px rgba(0,0,0,0.3)', transition:'transform 0.15s,box-shadow 0.15s' }}
                onMouseDown={e => (e.currentTarget.style.transform='scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform='scale(1)')}
              >Start Your Journey</button>
              <button
                onClick={() => { setIsLogin(true); setScreen('choose-method'); }}
                style={{ width:'100%', height:52, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:16, cursor:'pointer', fontSize:15, fontWeight:600, color:'rgba(255,255,255,0.85)', letterSpacing:'0.03em', backdropFilter:'blur(10px)', transition:'background 0.2s' }}
              >Sign In</button>
            </div>
          </div>

          <div style={{ textAlign:'center', paddingBottom:36, color:'rgba(255,255,255,0.25)', fontSize:11, letterSpacing:'0.05em' }}>For heterosexual singles · 18+ only</div>
        </div>
      </>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════════
     ALL OTHER SCREENS — white card
  ════════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col" style={{ background:'linear-gradient(170deg,#040810 0%,#0a0f1e 35%,#0d1535 100%)' }}>
      <div className="flex-none px-6 pt-10 pb-8 text-center">
        <button
          onClick={() => setScreen('welcome')}
          style={{ fontFamily:"'Georgia',serif", fontSize:22, fontWeight:900, fontStyle:'italic', background:'linear-gradient(135deg,#ffd700,#ff9500,#ffec6e)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', border:'none', cursor:'pointer', letterSpacing:'0.04em' }}
        >CLEVER DATE MATCH</button>
      </div>

      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl overflow-y-auto">

        {/* ── CHOOSE METHOD ──────────────────────────────────────────── */}
        {screen === 'choose-method' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{isLogin ? 'Welcome back' : 'Create account'}</h2>
            <p className="text-gray-500 text-sm mb-4">{isLogin ? 'Sign in to continue your journey' : 'Join thousands finding real love'}</p>

            {/* Google Sign-In — real OAuth when configured */}
            {GOOGLE_CONFIGURED ? (
              <GoogleSignInButton isLogin={isLogin} onSuccess={handleGoogleSuccess} onError={() => toast({ variant: 'destructive', title: 'Google sign-in failed', description: 'Could not connect to Google. Try email instead.' })} />
            ) : (
              <button
                className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors shadow-sm"
                onClick={() => toast({
                  variant: 'destructive',
                  title: 'Google sign-in is not available yet',
                  description: 'Please use email or phone sign-in for now.',
                })}
              >
                <GoogleIcon size={22} />
                <span className="font-semibold text-gray-500">Google sign-in unavailable</span>
              </button>
            )}

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-gray-400 text-xs font-medium">or use email</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button
              className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm"
              onClick={() => setScreen(isLogin ? 'email-login' : 'email-signup')}
            >
              <Mail className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-700">{isLogin ? 'Sign in with Email' : 'Sign up with Email'}</span>
            </button>

            {/* Phone sign-in for existing users; sign-up disabled at launch */}
            {(isLogin || PHONE_SIGNUP_ENABLED) && (
              <button
                className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm"
                onClick={() => setScreen(isLogin ? 'phone-login' : 'phone-signup')}
              >
                <Phone className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-gray-700">{isLogin ? 'Continue with Phone Number' : 'Sign up with Phone Number'}</span>
              </button>
            )}

            <div className="mt-4 text-center">
              {isLogin ? (
                <p className="text-sm text-gray-500">Don't have an account?{' '}<button className="text-blue-600 font-semibold" onClick={() => setIsLogin(false)}>Sign Up</button></p>
              ) : (
                <p className="text-sm text-gray-500">Already have an account?{' '}<button className="text-blue-600 font-semibold" onClick={() => setIsLogin(true)}>Sign In</button></p>
              )}
            </div>
          </div>
        )}

        {/* ── EMAIL LOGIN ────────────────────────────────────────────── */}
        {screen === 'email-login' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-800">Sign in with Email</h2>
            </div>
            <Form {...emailLoginForm}>
              <form onSubmit={emailLoginForm.handleSubmit(handleEmailLogin)} className="space-y-4">
                <FormField control={emailLoginForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <Input {...field} type="email" placeholder="you@gmail.com" className="pl-10 h-12 rounded-xl" autoComplete="email" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={emailLoginForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="Enter your password" className="pr-10 h-12 rounded-xl" autoComplete="current-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="text-right">
                  <button type="button" className="text-sm text-blue-600 font-medium" onClick={() => setScreen('forgot-password')}>Forgot Password?</button>
                </div>
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl mt-2" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }} disabled={emailLoginForm.formState.isSubmitting}>
                  {emailLoginForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
                </Button>
                <p className="text-center text-sm text-gray-500">New here?{' '}<button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('email-signup')}>Create account</button></p>
              </form>
            </Form>
          </div>
        )}

        {/* ── EMAIL SIGNUP ───────────────────────────────────────────── */}
        {screen === 'email-signup' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-800">Create Account</h2>
            </div>
            <Form {...emailSignupForm}>
              <form onSubmit={emailSignupForm.handleSubmit(handleEmailSignup)} className="space-y-4">
                <FormField control={emailSignupForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <Input {...field} type="email" placeholder="you@gmail.com" className="pl-10 h-12 rounded-xl" autoComplete="email" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={emailSignupForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Create Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" className="pr-10 h-12 rounded-xl" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={emailSignupForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type={showConfirm ? 'text' : 'password'} placeholder="Repeat your password" className="pr-10 h-12 rounded-xl" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-3 text-gray-400">
                          {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={emailSignupForm.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-gray-400" />
                            <SelectValue placeholder="Select your country" />
                          </div>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <p className="text-xs text-gray-400 text-center">By signing up, you agree to our Terms of Service and Privacy Policy.</p>
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }} disabled={emailSignupForm.formState.isSubmitting}>
                  {emailSignupForm.formState.isSubmitting ? 'Creating account…' : 'Create Account'}
                </Button>
                <p className="text-center text-sm text-gray-500">Already have an account?{' '}<button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('email-login')}>Sign In</button></p>
              </form>
            </Form>
          </div>
        )}

        {/* ── VERIFY EMAIL ───────────────────────────────────────────── */}
        {screen === 'verify-email' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center text-center mb-4 pt-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background:'linear-gradient(135deg,#e3f2fd,#bbdefb)' }}>
                <ShieldCheck className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Check your inbox</h2>
                 <p className="text-gray-500 text-sm max-w-xs">
                 We sent a verification link to <strong>{pendingUser?.email || 'your email'}</strong>. Open it, then return here and press the button below.
              </p>
            </div>
            <Button type="button" onClick={handleVerifyEmail} className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }}>
              Check verification status
            </Button>
            <div className="flex flex-col items-center gap-3 mt-2">
               <button className="text-sm text-blue-600 font-medium" onClick={handleResendEmailCode}>Didn't receive it? Resend link</button>
            </div>
          </div>
        )}

        {/* ── FORGOT PASSWORD ────────────────────────────────────────── */}
        {screen === 'forgot-password' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div className="flex flex-col items-center text-center mb-4 pt-2">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background:'linear-gradient(135deg,#fff3e0,#ffe0b2)' }}>
                <KeyRound className="w-8 h-8 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Forgot Password?</h2>
              <p className="text-gray-500 text-sm max-w-xs">Enter your email and we'll send you a secure Clever Date Match reset link.</p>
            </div>
            <Form {...forgotForm}>
              <form onSubmit={forgotForm.handleSubmit(handleForgotPassword)} className="space-y-4">
                <FormField control={forgotForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <Input {...field} type="email" placeholder="you@gmail.com" className="pl-10 h-12 rounded-xl" autoComplete="email" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }} disabled={forgotForm.formState.isSubmitting}>
                  {forgotForm.formState.isSubmitting ? 'Sending…' : 'Send Reset Link'}
                </Button>
              </form>
            </Form>
          </div>
        )}

        {/* ── RESET PASSWORD ─────────────────────────────────────────── */}
        {/* ── PHONE LOGIN ────────────────────────────────────────────── */}
        {screen === 'phone-login' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div className="flex items-center gap-2 mb-4">
              <Phone className="w-6 h-6 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-800">Sign in with Phone</h2>
            </div>
            <Form {...phoneLoginForm}>
              <form onSubmit={phoneLoginForm.handleSubmit(handlePhoneLogin)} className="space-y-4">
                <FormField control={phoneLoginForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <Input {...field} type="tel" placeholder="+1 234 567 8900" className="pl-10 h-12 rounded-xl" autoComplete="tel" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phoneLoginForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="Enter your password" className="pr-10 h-12 rounded-xl" autoComplete="current-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl mt-2" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }} disabled={phoneLoginForm.formState.isSubmitting}>
                  {phoneLoginForm.formState.isSubmitting ? 'Signing in…' : 'Sign In'}
                </Button>
                <p className="text-center text-sm text-gray-500">New here?{' '}<button type="button" className="text-blue-600 font-semibold" onClick={() => { setIsLogin(false); setScreen('choose-method'); }}>Create account</button></p>
              </form>
            </Form>
          </div>
        )}

        {/* ── PHONE SIGNUP (disabled at launch) ─────────────────────── */}
        {screen === 'phone-signup' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2"><ArrowLeft className="w-4 h-4" /> Back</button>
            <div className="flex items-center gap-2 mb-4">
              <Phone className="w-6 h-6 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-800">Sign up with Phone</h2>
            </div>
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(handlePhoneSignup)} className="space-y-4">
                <FormField control={phoneForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                        <Input {...field} type="tel" placeholder="+1 234 567 8900" className="pl-10 h-12 rounded-xl" autoComplete="tel" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phoneForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Create Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="Min. 8 characters" className="pr-10 h-12 rounded-xl" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phoneForm.control} name="confirmPassword" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input {...field} type={showConfirm ? 'text' : 'password'} placeholder="Repeat your password" className="pr-10 h-12 rounded-xl" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-3 text-gray-400">
                          {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={phoneForm.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 rounded-xl">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-gray-400" />
                            <SelectValue placeholder="Select your country" />
                          </div>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-72">
                        {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }} disabled={phoneForm.formState.isSubmitting}>
                  {phoneForm.formState.isSubmitting ? 'Creating account…' : 'Create Account'}
                </Button>
              </form>
            </Form>
          </div>
        )}

        {/* ── OTP VERIFICATION ───────────────────────────────────────── */}
        {screen === 'otp' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2"><ArrowLeft className="w-4 h-4" /> Back</button>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Enter your verification code</h2>
            <p className="text-gray-500 text-sm mb-4">A 6-digit code was sent to {pendingPhone}</p>
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-4">
                <FormField control={otpForm.control} name="otp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>One-Time Password</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" inputMode="numeric" maxLength={6} placeholder="000000" className="h-14 rounded-xl text-center text-2xl tracking-[0.4em] font-semibold" autoComplete="one-time-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background:'linear-gradient(135deg,#1565c0,#1a237e)' }} disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting ? 'Verifying…' : 'Verify Code'}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  Didn't receive it?{' '}
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => handleSendOtp(pendingPhone)}>Resend OTP</button>
                </p>
              </form>
            </Form>
          </div>
        )}

      </div>
      {/* Keep this attached to the DOM: Firebase uses it for the invisible reCAPTCHA challenge. */}
      <div id="firebase-recaptcha" className="fixed left-0 top-0 h-px w-px overflow-hidden" aria-hidden="true" />
    </div>
  );
}
