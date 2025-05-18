import { useState } from 'react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = loginSchema.extend({
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function OnboardingPage() {
  const [isLogin, setIsLogin] = useState(true);
  const { login, register } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onLoginSubmit = async (data: LoginForm) => {
    try {
      await login(data.username, data.password);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error.message || "Please check your credentials and try again",
      });
    }
  };

  const onRegisterSubmit = async (data: RegisterForm) => {
    try {
      await register(data.username, data.password);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "Please try with a different username",
      });
    }
  };

  const handleGetStarted = () => {
    setIsLogin(false);
  };

  return (
    <div className="px-4">
      <Card className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
        <CardContent className="p-6">
          <h2 className="font-poppins text-xl font-bold text-[#212529] mb-4">Welcome to Tim Clever Date</h2>
          <p className="text-gray-600 mb-6">Real People. Verified Love. One Match at a Time.</p>
          
          {isLogin ? (
            <>
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <i className="ri-user-heart-line text-primary"></i>
                  </div>
                  <div className="ml-3">
                    <p className="font-medium text-[#212529]">One Match Only</p>
                    <p className="text-sm text-gray-500">Focus fully on one person at a time</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                    <i className="ri-shield-check-line text-secondary"></i>
                  </div>
                  <div className="ml-3">
                    <p className="font-medium text-[#212529]">Verified Profiles</p>
                    <p className="text-sm text-gray-500">AI verification ensures real people only</p>
                  </div>
                </div>
                
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                    <i className="ri-chat-private-line text-accent"></i>
                  </div>
                  <div className="ml-3">
                    <p className="font-medium text-[#212529]">Meaningful Connections</p>
                    <p className="text-sm text-gray-500">No distractions, just one relationship</p>
                  </div>
                </div>
              </div>

              <Button 
                className="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 transition-colors"
                onClick={handleGetStarted}
              >
                Get Started
              </Button>
              <Button 
                variant="ghost" 
                className="w-full mt-3"
                onClick={() => setIsLogin(true)}
              >
                Already have an account? Log in
              </Button>
            </>
          ) : (
            <>
              {isLogin ? (
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} autoComplete="username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} autoComplete="current-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 transition-colors"
                      disabled={loginForm.formState.isSubmitting}
                    >
                      {loginForm.formState.isSubmitting ? 'Logging in...' : 'Log In'}
                    </Button>
                  </form>
                </Form>
              ) : (
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} autoComplete="username" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} autoComplete="new-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} autoComplete="new-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 transition-colors"
                      disabled={registerForm.formState.isSubmitting}
                    >
                      {registerForm.formState.isSubmitting ? 'Creating Account...' : 'Create Account'}
                    </Button>
                  </form>
                </Form>
              )}
              <Button 
                variant="ghost" 
                className="w-full mt-3"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
