import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, Eye, EyeOff, ArrowLeft, Heart, ShieldCheck, Star, ChevronRight, Globe } from 'lucide-react';
import { SiGoogle } from 'react-icons/si';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COUNTRIES } from '@/lib/countries';

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

export default function OnboardingPage() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const { loginWithEmail, loginWithPhone, registerWithEmail, registerWithPhone, sendOtp, verifyOtp } = useAuth();
  const { toast } = useToast();

  const emailLoginForm = useForm({ resolver: zodResolver(emailLoginSchema), defaultValues: { email: '', password: '' } });
  const emailSignupForm = useForm({ resolver: zodResolver(emailSignupSchema), defaultValues: { email: '', password: '', confirmPassword: '', country: '' } });
  const phoneForm = useForm({ resolver: zodResolver(phoneSchema), defaultValues: { phone: '', password: '', confirmPassword: '', country: '' } });
  const phoneLoginForm = useForm({ resolver: zodResolver(phoneLoginSchema), defaultValues: { phone: '', password: '' } });
  const otpForm = useForm({ resolver: zodResolver(otpSchema), defaultValues: { otp: '' } });

  const handleEmailLogin = async (data: z.infer<typeof emailLoginSchema>) => {
    try {
      await loginWithEmail(data.email, data.password);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Login failed', description: e.message });
    }
  };

  const handleEmailSignup = async (data: z.infer<typeof emailSignupSchema>) => {
    try {
      await registerWithEmail(data.email, data.password, data.country);
      toast({ title: 'Account created!', description: 'Welcome to Tim Clever Date.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Registration failed', description: e.message });
    }
  };

  const handlePhoneSignup = async (data: z.infer<typeof phoneSchema>) => {
    try {
      await registerWithPhone(data.phone, data.password, data.country);
      toast({ title: 'Account created!', description: 'Welcome to Tim Clever Date.' });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Registration failed', description: e.message });
    }
  };

  const handlePhoneLogin = async (data: z.infer<typeof phoneLoginSchema>) => {
    try {
      await loginWithPhone(data.phone, data.password);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Login failed', description: e.message });
    }
  };

  const handleSendOtp = async (phone: string) => {
    try {
      const res = await sendOtp(phone);
      setPendingPhone(phone);
      setScreen('otp');
      if (res?.otp) setDevOtp(res.otp);
      toast({ title: 'OTP Sent', description: `A 6-digit code was sent to ${phone}` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed to send OTP', description: e.message });
    }
  };

  const handleVerifyOtp = async (data: z.infer<typeof otpSchema>) => {
    try {
      await verifyOtp(pendingPhone, data.otp);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Invalid OTP', description: e.message });
    }
  };

  const back = () => {
    if (screen === 'otp') return setScreen('phone-login');
    setScreen('choose-method');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #1a237e 0%, #1565c0 50%, #0d47a1 100%)' }}>

      {/* Header */}
      <div className="flex-none px-6 pt-14 pb-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
            <Heart className="text-white w-7 h-7 fill-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Tim Clever Date</h1>
        <p className="text-blue-200 mt-2 text-sm">Real People. Verified Love. One Match at a Time.</p>
      </div>

      {/* Content Card */}
      <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl overflow-y-auto">

        {/* WELCOME SCREEN */}
        {screen === 'welcome' && (
          <div className="flex flex-col gap-6">
            <div className="space-y-4">
              {[
                { icon: <Heart className="w-5 h-5 text-rose-500" />, title: 'One Match Only', desc: 'Focus fully on one person at a time for meaningful connection' },
                { icon: <ShieldCheck className="w-5 h-5 text-blue-600" />, title: 'AI Verified Profiles', desc: 'Facial verification ensures every profile is real' },
                { icon: <Star className="w-5 h-5 text-amber-500" />, title: 'Smart Compatibility', desc: 'AI-powered matching based on personality & preferences' },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50">
                  <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                    {f.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{f.title}</p>
                    <p className="text-sm text-gray-500">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button
              className="w-full h-14 text-base font-semibold rounded-2xl shadow-lg"
              style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }}
              onClick={() => { setIsLogin(false); setScreen('choose-method'); }}
            >
              Get Started
            </Button>
            <Button
              variant="ghost"
              className="w-full h-12 text-blue-700 font-medium"
              onClick={() => { setIsLogin(true); setScreen('choose-method'); }}
            >
              Already have an account? <span className="ml-1 underline">Sign In</span>
            </Button>
          </div>
        )}

        {/* CHOOSE METHOD */}
        {screen === 'choose-method' && (
          <div className="flex flex-col gap-4">
            <button onClick={back} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-1">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-gray-500 text-sm mb-4">
              {isLogin ? 'Sign in to continue your journey' : 'Join thousands finding real love'}
            </p>

            {/* Google / Gmail button */}
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
              <ChevronRight className="w-4 h-4 text-gray-400 ml-auto" />
            </button>

            <div className="mt-4 text-center">
              {isLogin ? (
                <p className="text-sm text-gray-500">
                  Don't have an account?{' '}
                  <button className="text-blue-600 font-semibold" onClick={() => setIsLogin(false)}>
                    Sign Up
                  </button>
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Already have an account?{' '}
                  <button className="text-blue-600 font-semibold" onClick={() => setIsLogin(true)}>
                    Sign In
                  </button>
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
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('email-signup')}>
                    Create account
                  </button>
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
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('email-login')}>
                    Sign In
                  </button>
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
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('phone-signup')}>
                    Create account
                  </button>
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
                  <button type="button" className="text-blue-600 font-semibold" onClick={() => setScreen('phone-login')}>
                    Sign In
                  </button>
                </p>
              </form>
            </Form>
          </div>
        )}

        {/* OTP SCREEN */}
        {screen === 'otp' && (
          <div className="flex flex-col gap-4">
            <button onClick={() => setScreen('phone-login')} className="flex items-center gap-1 text-blue-600 text-sm mb-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h2 className="text-2xl font-bold text-gray-800">Enter OTP</h2>
            <p className="text-gray-500 text-sm">
              A 6-digit code was sent to <span className="font-medium text-gray-700">{pendingPhone}</span>
            </p>
            {devOtp && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                <strong>Dev mode — OTP:</strong> {devOtp}
              </div>
            )}
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-4">
                <FormField control={otpForm.control} name="otp" render={({ field }) => (
                  <FormItem>
                    <FormLabel>6-Digit Code</FormLabel>
                    <FormControl>
                      <Input {...field} type="text" inputMode="numeric" maxLength={6} placeholder="123456" className="h-14 text-center text-2xl tracking-widest rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full h-14 text-base font-semibold rounded-2xl" style={{ background: 'linear-gradient(135deg, #1565c0, #1a237e)' }} disabled={otpForm.formState.isSubmitting}>
                  {otpForm.formState.isSubmitting ? 'Verifying...' : 'Verify Code'}
                </Button>
                <button type="button" className="w-full text-center text-sm text-blue-600 font-medium" onClick={() => handleSendOtp(pendingPhone)}>
                  Resend code
                </button>
              </form>
            </Form>
          </div>
        )}

      </div>
    </div>
  );
}
