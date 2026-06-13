import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, Eye, EyeOff, ArrowLeft, Globe } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRIES, detectCountryFromIP } from '@/lib/countries';

type Screen = 'welcome' | 'choose-method' | 'email-login' | 'email-signup' | 'phone-login' | 'phone-signup' | 'otp';

const emailLoginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const emailSignupSchema = z.object({
  email: z.string().email('Please enter a valid Gmail or email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  country: z.string().min(2, 'Please select your country'),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const phoneSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Enter phone with country code e.g. +1234567890'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  country: z.string().min(2, 'Please select your country'),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const phoneLoginSchema = z.object({
  phone: z.string().min(5, 'Enter your phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const otpSchema = z.object({
  otp: z.string().length(6, 'Enter the 6-digit code'),
});

/* ─── Floating particle component ─── */
function Particle({ style }: { style: React.CSSProperties }) {
  return <div className="absolute rounded-full pointer-events-none" style={style} />;
}

function CinematicBg() {
  const particles = [
    { width: 6, height: 6, top: '12%', left: '8%', background: 'rgba(255,200,80,0.55)', filter: 'blur(1px)', animation: 'float1 7s ease-in-out infinite' },
    { width: 10, height: 10, top: '22%', left: '78%', background: 'rgba(255,100,150,0.45)', filter: 'blur(2px)', animation: 'float2 9s ease-in-out infinite' },
    { width: 4, height: 4, top: '55%', left: '15%', background: 'rgba(180,140,255,0.6)', filter: 'blur(1px)', animation: 'float3 6s ease-in-out infinite' },
    { width: 8, height: 8, top: '70%', left: '85%', background: 'rgba(255,200,80,0.4)', filter: 'blur(2px)', animation: 'float1 8s ease-in-out infinite 1s' },
    { width: 5, height: 5, top: '38%', left: '92%', background: 'rgba(100,200,255,0.5)', filter: 'blur(1px)', animation: 'float2 10s ease-in-out infinite 2s' },
    { width: 14, height: 14, top: '80%', left: '30%', background: 'rgba(255,120,80,0.3)', filter: 'blur(3px)', animation: 'float3 12s ease-in-out infinite 0.5s' },
    { width: 3, height: 3, top: '10%', left: '55%', background: 'rgba(255,255,255,0.7)', filter: 'blur(0.5px)', animation: 'float1 5s ease-in-out infinite 3s' },
    { width: 7, height: 7, top: '45%', left: '45%', background: 'rgba(255,200,80,0.35)', filter: 'blur(2px)', animation: 'float2 11s ease-in-out infinite 1.5s' },
  ];
  return (
    <>
      {particles.map((p, i) => (
        <Particle key={i} style={p} />
      ))}
    </>
  );
}

export default function OnboardingPage() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const { loginWithEmail, loginWithPhone, registerWithEmail, registerWithPhone, sendOtp, verifyOtp } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    detectCountryFromIP().then(code => {
      if (!code) return;
      if (!emailSignupForm.getValues('country')) emailSignupForm.setValue('country', code);
      if (!phoneForm.getValues('country')) phoneForm.setValue('country', code);
    });
  }, []);

  const emailLoginForm = useForm({ resolver: zodResolver(emailLoginSchema), defaultValues: { email: '', password: '' } });
  const emailSignupForm = useForm({ resolver: zodResolver(emailSignupSchema), defaultValues: { email: '', password: '', confirmPassword: '', country: '' } });
  const phoneForm = useForm({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '', password: '', confirmPassword: '', country: '' } });
  const phoneLoginForm = useForm({ resolver: zodResolver(phoneLoginSchema), defaultValues: { phone: '', password: '' } });
  const otpForm = useForm({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  const handleEmailLogin = async (data: z.infer<typeof emailLoginSchema>) => {
    try { await loginWithEmail(data.email, data.password); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Login failed', description: e.message }); }
  };

  const handleEmailSignup = async (data: z.infer<typeof emailSignupSchema>) => {
    try {
      await registerWithEmail(data.email, data.password, data.country);
      toast({ title: 'Account created!', description: 'Welcome to Clever Date Match.' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Registration failed', description: e.message }); }
  };

  const handlePhoneSignup = async (data: z.infer<typeof phoneSchema>) => {
    try {
      await registerWithPhone(data.phone, data.password, data.country);
      toast({ title: 'Account created!', description: 'Welcome to Clever Date Match.' });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Registration failed', description: e.message }); }
  };

  const handlePhoneLogin = async (data: z.infer<typeof phoneLoginSchema>) => {
    try { await loginWithPhone(data.phone, data.password); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Login failed', description: e.message }); }
  };

  const handleSendOtp = async (phone: string) => {
    try {
      const res = await sendOtp(phone);
      setPendingPhone(phone);
      setScreen('otp');
      if (res?.otp) setDevOtp(res.otp);
      toast({ title: 'OTP Sent', description: `A 6-digit code was sent to ${phone}` });
    } catch (e: any) { toast({ variant: 'destructive', title: 'Failed to send OTP', description: e.message }); }
  };

  const handleVerifyOtp = async (data: z.infer<typeof otpSchema>) => {
    try { await verifyOtp(pendingPhone, data.otp); }
    catch (e: any) { toast({ variant: 'destructive', title: 'Invalid OTP', description: e.message }); }
  };

  const back = () => {
    if (screen === 'otp') return setScreen('phone-login');
    setScreen('choose-method');
  };

  /* ── Welcome screen is full-cinematic; all others use white card ── */
  if (screen === 'welcome') {
    return (
      <>
        <style>{`
          @keyframes float1 { 0%,100%{transform:translateY(0px) scale(1)} 50%{transform:translateY(-18px) scale(1.1)} }
          @keyframes float2 { 0%,100%{transform:translateY(0px) rotate(0deg)} 50%{transform:translateY(-12px) rotate(20deg)} }
          @keyframes float3 { 0%,100%{transform:translateY(0px)} 33%{transform:translateY(-8px)} 66%{transform:translateY(4px)} }
          @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
          @keyframes heartbeat { 0%,100%{transform:scale(1)} 14%{transform:scale(1.12)} 28%{transform:scale(1)} 42%{transform:scale(1.06)} 70%{transform:scale(1)} }
          @keyframes glow { 0%,100%{text-shadow:0 0 30px rgba(255,195,70,0.6),0 0 60px rgba(255,150,50,0.3)} 50%{text-shadow:0 0 50px rgba(255,220,100,0.9),0 0 100px rgba(255,180,60,0.5)} }
        `}</style>
        <div
          className="min-h-screen flex flex-col relative overflow-hidden"
          style={{ background: 'linear-gradient(170deg, #040810 0%, #0a0f1e 35%, #0d1535 60%, #0a0f22 100%)' }}
        >
          {/* Background glow orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div style={{ position:'absolute', top:'-10%', left:'30%', width:'420px', height:'420px', background:'radial-gradient(circle, rgba(21,101,192,0.25) 0%, transparent 70%)', borderRadius:'50%' }} />
            <div style={{ position:'absolute', top:'30%', right:'-15%', width:'350px', height:'350px', background:'radial-gradient(circle, rgba(180,50,120,0.18) 0%, transparent 70%)', borderRadius:'50%' }} />
            <div style={{ position:'absolute', bottom:'-5%', left:'-10%', width:'300px', height:'300px', background:'radial-gradient(circle, rgba(100,60,200,0.15) 0%, transparent 70%)', borderRadius:'50%' }} />
            <CinematicBg />
          </div>

          {/* Top badge */}
          <div className="flex justify-center pt-14" style={{ animation: 'fadeUp 0.8s ease both' }}>
            <div style={{
              display:'inline-flex', alignItems:'center', gap:'6px',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '100px',
              padding: '6px 18px',
              backdropFilter: 'blur(10px)',
            }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#e53935', display:'inline-block', boxShadow:'0 0 8px #e53935' }} />
              <span style={{ color: 'rgba(255,255,255,0.75)', fontSize:12, fontWeight:600, letterSpacing:2, textTransform:'uppercase' }}>
                International · Verified · Exclusive
              </span>
            </div>
          </div>

          {/* Hero title */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center" style={{ animation:'fadeUp 1s ease 0.2s both' }}>
            {/* The big cinematic "C" + rest of name */}
            <div style={{ marginBottom: 8, lineHeight: 1 }}>
              <span style={{
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: 'clamp(100px, 22vw, 160px)',
                fontWeight: 900,
                fontStyle: 'italic',
                background: 'linear-gradient(135deg, #ffd700 0%, #ff9500 40%, #ffec6e 70%, #ffd700 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'glow 3s ease-in-out infinite, shimmer 4s linear infinite',
                display: 'inline-block',
                filter: 'drop-shadow(0 0 40px rgba(255,200,50,0.4))',
              }}>C</span>
            </div>
            <div style={{ marginTop: -16, marginBottom: 20 }}>
              <span style={{
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: 'clamp(28px, 7vw, 48px)',
                fontWeight: 700,
                fontStyle: 'italic',
                letterSpacing: '0.08em',
                background: 'linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                display: 'block',
                textTransform: 'uppercase',
              }}>LEVER DATE MATCH</span>
            </div>

            {/* Decorative line */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <div style={{ width:60, height:1, background:'linear-gradient(90deg,transparent,rgba(255,200,70,0.5))' }} />
              <span style={{ color:'rgba(255,200,70,0.7)', fontSize:18 }}>♥</span>
              <div style={{ width:60, height:1, background:'linear-gradient(90deg,rgba(255,200,70,0.5),transparent)' }} />
            </div>

            {/* Tagline */}
            <p style={{
              color: 'rgba(255,255,255,0.55)',
              fontSize: 'clamp(13px,3.5vw,16px)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontWeight: 400,
              marginBottom: 56,
              maxWidth: 280,
            }}>
              Real People · Verified Love · One Match at a Time
            </p>

            {/* Feature pills */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:56 }}>
              {['🛡️ AI Verified', '💎 One Match Only', '🌍 International', '⭐ Smart AI Match'].map((f,i) => (
                <span key={i} style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 100,
                  padding: '7px 16px',
                  color: 'rgba(255,255,255,0.65)',
                  fontSize: 12,
                  fontWeight: 500,
                  backdropFilter: 'blur(8px)',
                  animation: `fadeUp 0.8s ease ${0.4 + i * 0.1}s both`,
                }}>{f}</span>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ width:'100%', maxWidth:380, display:'flex', flexDirection:'column', gap:14, animation:'fadeUp 1s ease 0.8s both' }}>
              <button
                onClick={() => { setIsLogin(false); setScreen('choose-method'); }}
                style={{
                  width:'100%', height:58,
                  background: 'linear-gradient(135deg, #ffd700 0%, #ff9500 100%)',
                  border:'none', borderRadius:16, cursor:'pointer',
                  fontSize:16, fontWeight:700, color:'#000',
                  letterSpacing:'0.05em',
                  boxShadow: '0 8px 32px rgba(255,180,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseDown={e => (e.currentTarget.style.transform='scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform='scale(1)')}
              >
                Start Your Journey
              </button>

              <button
                onClick={() => { setIsLogin(true); setScreen('choose-method'); }}
                style={{
                  width:'100%', height:52,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius:16, cursor:'pointer',
                  fontSize:15, fontWeight:600,
                  color:'rgba(255,255,255,0.85)',
                  letterSpacing:'0.03em',
                  backdropFilter:'blur(10px)',
                  transition:'background 0.2s',
                }}
              >
                Sign In
              </button>
            </div>
          </div>

          {/* Bottom disclaimer */}
          <div style={{ textAlign:'center', paddingBottom:36, color:'rgba(255,255,255,0.25)', fontSize:11, letterSpacing:'0.05em' }}>
            For heterosexual singles · 18+ only
          </div>
        </div>
      </>
    );
  }

  /* ─── All other screens: white card layout ─── */
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(170deg, #040810 0%, #0a0f1e 35%, #0d1535 100%)' }}>
      {/* Compact header for sub-screens */}
      <div className="flex-none px-6 pt-10 pb-8 text-center">
        <button
          onClick={() => setScreen('welcome')}
          style={{
            fontFamily: "'Georgia', serif",
            fontSize: 22,
            fontWeight: 900,
            fontStyle: 'italic',
            background: 'linear-gradient(135deg, #ffd700, #ff9500, #ffec6e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          CLEVER DATE MATCH
        </button>
      </div>

      {/* White card */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl overflow-y-auto">

        {/* CHOOSE METHOD */}
        {screen === 'choose-method' && (
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              {isLogin ? 'Sign in to continue your journey' : 'Join thousands finding real love'}
            </p>

            <button
              className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm"
              onClick={() => setScreen(isLogin ? 'email-login' : 'email-signup')}
            >
              <SiGoogle className="w-5 h-5 text-red-500" />
              <span className="font-semibold text-gray-700">
                {isLogin ? 'Continue with Gmail' : 'Sign up with Gmail'}
              </span>
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-gray-400 text-xs font-medium">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <button
              className="w-full h-14 flex items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-sm"
              onClick={() => setScreen(isLogin ? 'phone-login' : 'phone-signup')}
            >
              <Phone className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-gray-700">
                {isLogin ? 'Continue with Phone Number' : 'Sign up with Phone Number'}
              </span>
            </button>

            <div className="mt-4 text-center">
              {isLogin ? (
                <p className="text-sm text-gray-500">
                  Don't have an account?{' '}
                  <button className="text-blue-600 font-semibold" onClick={() => setIsLogin(false)}>Sign Up</button>
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Already have an account?{' '}
                  <button className="text-blue-600 font-semibold" onClick={() => setIsLogin(true)}>Sign In</button>
                </p>
              )}
            </div>
          </div>
        )}

        {/* EMAIL LOGIN */}
        {screen === 'email-login' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-2 mb-4">
              <SiGoogle className="w-6 h-6 text-red-500" />
              <h2 className="text-2xl font-bold text-gray-800">Sign in with Gmail</h2>
            </div>
            <Form {...emailLoginForm}>
              <form onSubmit={emailLoginForm.handleSubmit(handleEmailLogin)} className="space-y-4">
                <FormField control={emailLoginForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gmail / Email Address</FormLabel>
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
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl mt-2" style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }} disabled={emailLoginForm.formState.isSubmitting}>
                  {emailLoginForm.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  New here?{' '}
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('email-signup')}>Create account</button>
                </p>
              </form>
            </Form>
          </div>
        )}

        {/* EMAIL SIGNUP */}
        {screen === 'email-signup' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-2 mb-4">
              <SiGoogle className="w-6 h-6 text-red-500" />
              <h2 className="text-2xl font-bold text-gray-800">Sign up with Gmail</h2>
            </div>
            <Form {...emailSignupForm}>
              <form onSubmit={emailSignupForm.handleSubmit(handleEmailSignup)} className="space-y-4">
                <FormField control={emailSignupForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gmail / Email Address</FormLabel>
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
                        {COUNTRIES.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <p className="text-xs text-gray-400 text-center">
                  By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }} disabled={emailSignupForm.formState.isSubmitting}>
                  {emailSignupForm.formState.isSubmitting ? 'Creating account...' : 'Create Account'}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  Already have an account?{' '}
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('email-login')}>Sign In</button>
                </p>
              </form>
            </Form>
          </div>
        )}

        {/* PHONE LOGIN */}
        {screen === 'phone-login' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
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
                        <Input {...field} type={showPassword ? 'text' : 'password'} placeholder="Your password" className="pr-10 h-12 rounded-xl" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }} disabled={phoneLoginForm.formState.isSubmitting}>
                  {phoneLoginForm.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  New here?{' '}
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('phone-signup')}>Create account</button>
                </p>
              </form>
            </Form>
          </div>
        )}

        {/* PHONE SIGNUP */}
        {screen === 'phone-signup' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Phone className="w-6 h-6 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-800">Sign up with Phone</h2>
            </div>
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(handlePhoneSignup)} className="space-y-4">
                <FormField control={phoneForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number (with country code)</FormLabel>
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
                        {COUNTRIES.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <p className="text-xs text-gray-400 text-center">
                  By signing up, you agree to our Terms of Service and Privacy Policy.
                </p>
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }} disabled={phoneForm.formState.isSubmitting}>
                  {phoneForm.formState.isSubmitting ? 'Creating account...' : 'Create Account'}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  Already have an account?{' '}
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('phone-login')}>Sign In</button>
                </p>
              </form>
            </Form>
          </div>
        )}

        {/* OTP */}
        {screen === 'otp' && (
          <div className="flex flex-col gap-4">
            <button onClick={() => setScreen('phone-login')} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-2xl font-bold text-gray-800">Enter OTP</h2>
            <p className="text-gray-500 text-sm">We sent a 6-digit code to <strong>{pendingPhone}</strong></p>
            {devOtp && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                Dev mode OTP: <strong>{devOtp}</strong>
              </div>
            )}
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-4">
                <FormField control={otpForm.control} name="otp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>6-Digit Code</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" inputMode="numeric" maxLength={6} placeholder="000000" className="h-14 text-center text-2xl tracking-widest rounded-xl" autoComplete="one-time-code" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }} disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting ? 'Verifying...' : 'Verify Code'}
                </Button>
                <p className="text-center text-sm text-gray-500">
                  Didn't receive it?{' '}
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => handleSendOtp(pendingPhone)}>Resend</button>
                </p>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
