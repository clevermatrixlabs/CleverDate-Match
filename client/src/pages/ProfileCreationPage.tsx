import { useState } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const profileSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  gender: z.enum(['male', 'female']),
  intention: z.enum(['marriage', 'long-term', 'getting-to-know'], {
    required_error: 'Please tell us what you are looking for',
  }),
  religion: z.string().optional(),
  aboutMe: z.string().min(10, 'Tell us a bit more about yourself').max(300, 'Bio is too long'),
  age: z.number().min(18, 'You must be at least 18 years old').max(100, 'Age is invalid')
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function ProfileCreationPage() {
  const [, navigate] = useLocation();
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [primaryPhoto, setPrimaryPhoto] = useState<File | null>(null);
  const [additionalPhoto, setAdditionalPhoto] = useState<File | null>(null);
  const [additionalPhoto2, setAdditionalPhoto2] = useState<File | null>(null);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      gender: 'male',
      intention: undefined as any,
      religion: '',
      aboutMe: '',
      age: 18
    }
  });

  const profileMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/users/profile', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'Failed to create profile');
      return body;
    },
    onSuccess: async () => {
      toast({
        title: "Profile created!",
        description: "Your profile has been created successfully.",
      });
      // Refresh the user data so the app knows profile is complete
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      navigate('/verify');
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Profile creation failed",
        description: error.message || "Please try again",
      });
    }
  });

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setFile: (file: File | null) => void
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  };

  const onSubmit = (data: ProfileForm) => {
    // Validate required files
    if (!primaryPhoto) {
      toast({
        variant: "destructive",
        title: "Primary photo required",
        description: "Please upload a primary photo",
      });
      return;
    }

    // Validate file sizes upfront to avoid slow/failed uploads.
    const MAX = 5 * 1024 * 1024; // 5 MB
    if (primaryPhoto.size > MAX) {
      toast({ variant: 'destructive', title: 'Photo too large', description: 'Please choose a photo under 5 MB.' });
      return;
    }
    if (additionalPhoto && additionalPhoto.size > MAX) {
      toast({ variant: 'destructive', title: 'Photo too large', description: 'Additional photo must be under 5 MB.' });
      return;
    }
    if (additionalPhoto2 && additionalPhoto2.size > MAX) {
      toast({ variant: 'destructive', title: 'Photo too large', description: 'Additional photo must be under 5 MB.' });
      return;
    }

    // Create FormData to send files
    const formData = new FormData();
    formData.append('primaryPhoto', primaryPhoto);
    if (additionalPhoto) {
      formData.append('additionalPhoto', additionalPhoto);
    }
    if (additionalPhoto2) {
      formData.append('additionalPhoto2', additionalPhoto2);
    }

    // Append form data
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    profileMutation.mutate(formData);
  };

  return (
    <div className="px-4">
      <Card className="bg-white rounded-xl shadow-md overflow-hidden mb-5">
        <CardContent className="p-6">
          <h2 className="font-poppins text-xl font-bold text-[#212529] mb-2">Create Your Profile</h2>
          <p className="text-gray-600 mb-6">Add photos and details to help others get to know you.</p>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">First Name</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                        placeholder="Your first name" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">Last Name</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                        placeholder="Your last name" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">Age</FormLabel>
                    <FormControl>
                      <Input 
                        {...field}
                        type="number"
                        min={18}
                        onChange={e => field.onChange(parseInt(e.target.value, 10))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                        placeholder="Your age" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">Gender</FormLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        type="button" 
                        className={`px-3 py-2 border ${field.value === 'male' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-300 text-gray-700'} rounded-lg font-medium`}
                        onClick={() => form.setValue('gender', 'male')}
                      >
                        Male
                      </Button>
                      <Button 
                        type="button" 
                        className={`px-3 py-2 border ${field.value === 'female' ? 'border-primary bg-primary/5 text-primary' : 'border-gray-300 text-gray-700'} rounded-lg font-medium`}
                        onClick={() => form.setValue('gender', 'female')}
                      >
                        Female
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="intention"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">
                      What are you looking for? <span className="text-red-500">*</span>
                    </FormLabel>
                    <p className="text-xs text-gray-500 mb-3">This helps us match you with people who want the same thing. Be honest.</p>
                    <div className="space-y-3">
                      {[
                        {
                          value: 'marriage',
                          emoji: '💍',
                          title: 'Marriage',
                          desc: "I'm ready to find my life partner. I want something real and lasting.",
                          activeBg: 'bg-rose-50 border-rose-400 ring-1 ring-rose-300',
                          activeText: 'text-rose-800',
                        },
                        {
                          value: 'long-term',
                          emoji: '💛',
                          title: 'Long-term relationship',
                          desc: 'I want to build a deep, meaningful relationship with the right person.',
                          activeBg: 'bg-amber-50 border-amber-400 ring-1 ring-amber-300',
                          activeText: 'text-amber-800',
                        },
                        {
                          value: 'getting-to-know',
                          emoji: '🌱',
                          title: 'Getting to know someone',
                          desc: 'I want to connect with someone special and see where it goes naturally.',
                          activeBg: 'bg-green-50 border-green-400 ring-1 ring-green-300',
                          activeText: 'text-green-800',
                        },
                      ].map((option) => {
                        const isSelected = field.value === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => field.onChange(option.value)}
                            className={`w-full text-left flex items-start gap-3 px-4 py-3.5 rounded-xl border-2 transition-all ${
                              isSelected
                                ? option.activeBg
                                : 'bg-white border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <span className="text-2xl mt-0.5 shrink-0">{option.emoji}</span>
                            <div>
                              <p className={`font-semibold text-sm ${isSelected ? option.activeText : 'text-gray-800'}`}>
                                {option.title}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{option.desc}</p>
                            </div>
                            {isSelected && (
                              <span className="ml-auto shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="religion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">Religion (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
                          <SelectValue placeholder="Select your religion" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Prefer not to say</SelectItem>
                        <SelectItem value="christianity">Christianity</SelectItem>
                        <SelectItem value="islam">Islam</SelectItem>
                        <SelectItem value="hinduism">Hinduism</SelectItem>
                        <SelectItem value="buddhism">Buddhism</SelectItem>
                        <SelectItem value="judaism">Judaism</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aboutMe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block text-sm font-medium text-gray-700 mb-1">About Me</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" 
                        rows={3} 
                        placeholder="Share something about yourself"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="mb-6">
                <Label className="block text-sm font-medium text-gray-700 mb-1">Photos <span className="text-red-500">*</span></Label>
                <p className="text-xs text-gray-500 mb-3">Upload up to 3 photos. First photo is required — the others are optional.</p>
                
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {/* Primary photo — required */}
                  <div 
                    className={`aspect-square bg-[#E9ECEF] rounded-lg border-2 border-dashed ${primaryPhoto ? 'border-blue-500' : 'border-gray-300'} flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 relative overflow-hidden`}
                    onClick={() => document.getElementById('primary-photo')?.click()}
                  >
                    {primaryPhoto ? (
                      <img src={URL.createObjectURL(primaryPhoto)} alt="Primary" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <i className="ri-image-add-line text-xl text-gray-400"></i>
                        <span className="text-xs text-gray-500 mt-1">Main photo*</span>
                      </>
                    )}
                    <input id="primary-photo" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, setPrimaryPhoto)} />
                  </div>
                  
                  {/* Additional photo 1 — optional */}
                  <div 
                    className={`aspect-square bg-[#E9ECEF] rounded-lg border-2 border-dashed ${additionalPhoto ? 'border-blue-400' : 'border-gray-300'} flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 relative overflow-hidden`}
                    onClick={() => document.getElementById('additional-photo')?.click()}
                  >
                    {additionalPhoto ? (
                      <img src={URL.createObjectURL(additionalPhoto)} alt="Additional" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <i className="ri-add-line text-xl text-gray-400"></i>
                        <span className="text-xs text-gray-500 mt-1">Optional</span>
                      </>
                    )}
                    <input id="additional-photo" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, setAdditionalPhoto)} />
                  </div>

                  {/* Additional photo 2 — optional */}
                  <div 
                    className={`aspect-square bg-[#E9ECEF] rounded-lg border-2 border-dashed ${additionalPhoto2 ? 'border-blue-400' : 'border-gray-300'} flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 relative overflow-hidden`}
                    onClick={() => document.getElementById('additional-photo-2')?.click()}
                  >
                    {additionalPhoto2 ? (
                      <img src={URL.createObjectURL(additionalPhoto2)} alt="Additional 2" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <i className="ri-add-line text-xl text-gray-400"></i>
                        <span className="text-xs text-gray-500 mt-1">Optional</span>
                      </>
                    )}
                    <input id="additional-photo-2" type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, setAdditionalPhoto2)} />
                  </div>
                </div>
                
                <p className="text-xs text-gray-500">
                  * Main photo required (under 5 MB). Extra photos are optional. Your live face scan happens on the next step.
                </p>
              </div>
              
              <Button 
                type="submit" 
                className="w-full py-3 px-4 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 transition-colors"
                disabled={profileMutation.isPending}
              >
                {profileMutation.isPending ? 'Creating Profile...' : 'Create Profile'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
