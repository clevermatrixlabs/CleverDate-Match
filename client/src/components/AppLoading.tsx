import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';

export function AppLoading() {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(100);
    }, 1500);
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 4;
      });
    }, 50);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);
  
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <div className="w-32 h-32 mb-8 relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-primary-light shadow-lg flex items-center justify-center">
          <svg 
            width="60" 
            height="60" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="text-white"
          >
            <path 
              d="M14 9.01V9M14 12.01V12M14 15.01V15M9 15.01V15M9 12.01V12M9 9.01V9M7 19H17C18.1046 19 19 18.1046 19 17V7C19 5.89543 18.1046 5 17 5H7C5.89543 5 5 5.89543 5 7V17C5 18.1046 5.89543 19 7 19Z" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
            />
            <path 
              d="M12 19V21" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
            />
            <path 
              d="M12 3V5" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
      
      <h1 className="text-2xl font-bold text-primary mb-2">Tim Clever Date</h1>
      <p className="text-gray-500 mb-6">Meaningful Connections</p>
      
      <div className="w-64 mb-4">
        <Progress value={progress} className="h-2" />
      </div>
      
      <p className="text-xs text-gray-400">
        {progress < 30 ? "Loading resources..." : 
         progress < 60 ? "Preparing your experience..." : 
         progress < 90 ? "Almost ready..." : 
         "Welcome to Tim Clever Date!"}
      </p>
    </div>
  );
}