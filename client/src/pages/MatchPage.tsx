import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { useMatch } from '@/context/MatchContext';
import ProfileCard from '@/components/ProfileCard';
import MatchOverlay from '@/components/MatchOverlay';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { COUNTRIES } from '@/lib/countries';
import { MatchCandidate } from '@/types';

const RELIGIONS = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Judaism', 'Sikhism', 'No preference'];

function ProfileGate({ missingFields, requiresVerification }: { missingFields?: string[]; requiresVerification?: boolean }) {
  const [, navigate] = useLocation();

  if (requiresVerification) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mb-5 shadow">
          <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.064-.522-4.007-1.447-5.7M12 4.5V3" />
          </svg>
        </div>
        <h2 className="font-poppins font-bold text-xl text-gray-800 mb-2">Verification Required</h2>
        <p className="text-gray-500 text-sm mb-6 max-w-xs">
          You need to complete face &amp; ID verification before you can start matching. This keeps Clever Date Match safe for everyone.
        </p>
        <button
          onClick={() => navigate('/verify')}
          className="bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-2xl px-8 py-3 font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Verify My Identity
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-5 shadow">
        <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <h2 className="font-poppins font-bold text-xl text-gray-800 mb-2">Complete Your Profile</h2>
      <p className="text-gray-500 text-sm mb-4 max-w-xs">
        Your profile must be 100% complete before you can match with anyone. Please add the following:
      </p>
      <ul className="mb-6 space-y-2 w-full max-w-xs text-left">
        {(missingFields || []).map((field, i) => (
          <li key={i} className="flex items-center gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-2 text-sm font-medium">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {field}
          </li>
        ))}
      </ul>
      <button
        onClick={() => navigate('/create-profile')}
        className="bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-2xl px-8 py-3 font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Complete My Profile
      </button>
    </div>
  );
}

export default function MatchPage() {
  const { potentialMatches, isLoadingMatches, sendLike, sendPass } = useMatch();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [showMatchOverlay, setShowMatchOverlay] = useState(false);
  const [matchedUser, setMatchedUser] = useState<MatchCandidate | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);

  const [minAge, setMinAge] = useState(user?.minAgePreference ?? 18);
  const [maxAge, setMaxAge] = useState(user?.maxAgePreference ?? 60);
  const [prefReligion, setPrefReligion] = useState(user?.preferredReligion ?? '');
  const [prefCountries, setPrefCountries] = useState<string[]>(user?.preferredCountries ?? []);

  // Fetch with error details so we can gate on missing profile / verification
  const matchQuery = useQuery<MatchCandidate[], { requiresVerification?: boolean; requiresProfile?: boolean; missingFields?: string[] }>({
    queryKey: ['/api/matches/potential'],
    queryFn: async () => {
      const res = await fetch('/api/matches/potential', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw body;
      }
      return res.json();
    },
    enabled: !!user,
    retry: false,
  });

  const savePrefs = useMutation({
    mutationFn: () =>
      apiRequest('PATCH', '/matches/preferences', {
        minAgePreference: minAge,
        maxAgePreference: maxAge,
        preferredReligion: prefReligion || null,
        preferredCountries: prefCountries,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches/potential'] });
      setShowPrefs(false);
    },
  });

  const handleLike = async (userId: number) => {
    try {
      await sendLike(userId);
      const liked = (matchQuery.data || []).find(u => u.id === userId);
      if (liked) { setMatchedUser(liked); setShowMatchOverlay(true); }
    } catch (e) { console.error('Like error', e); }
  };

  const handlePass = async (userId: number) => {
    try { await sendPass(userId); } catch (e) { console.error('Pass error', e); }
  };

  const toggleCountry = (name: string) =>
    setPrefCountries(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  // Gate screens
  const err = matchQuery.error as any;
  if (!matchQuery.isLoading && err) {
    if (err.requiresVerification) return <ProfileGate requiresVerification />;
    if (err.requiresProfile) return <ProfileGate missingFields={err.missingFields} />;
  }

  const candidates = matchQuery.data || [];
  const candidate = candidates[0];

  return (
    <div className="px-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between py-3">
        <div>
          <h1 className="font-poppins font-semibold text-gray-800">Discover</h1>
          {candidates.length > 0 && (
            <p className="text-xs text-gray-400">{candidates.length} match{candidates.length !== 1 ? 'es' : ''} for you</p>
          )}
        </div>
        <button
          onClick={() => setShowPrefs(true)}
          className="flex items-center gap-1.5 bg-blue-50 text-blue-700 rounded-full px-3 py-1.5 text-xs font-medium hover:bg-blue-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4-2A1 1 0 018 17v-3.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Preferences
        </button>
      </div>

      {/* Loading skeleton */}
      {matchQuery.isLoading && (
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-2xl h-96 animate-pulse" />
          <div className="bg-gray-100 rounded-2xl h-24 animate-pulse" />
        </div>
      )}

      {/* No matches */}
      {!matchQuery.isLoading && !err && !candidate && (
        <div className="bg-white rounded-2xl shadow-md p-8 text-center mt-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 mx-auto flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
            </svg>
          </div>
          <h3 className="font-poppins font-semibold text-lg text-gray-800 mb-2">No matches yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            You've seen everyone available right now. Try widening your preferences or check back soon.
          </p>
          <button
            onClick={() => setShowPrefs(true)}
            className="bg-blue-600 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Adjust Preferences
          </button>
        </div>
      )}

      {/* Profile card — one at a time */}
      {!matchQuery.isLoading && !err && candidate && (
        <ProfileCard
          user={candidate}
          onLike={() => handleLike(candidate.id)}
          onPass={() => handlePass(candidate.id)}
        />
      )}

      {/* Match overlay */}
      {showMatchOverlay && matchedUser && (
        <MatchOverlay
          matchedUser={matchedUser}
          onClose={() => setShowMatchOverlay(false)}
          onSendMessage={() => setShowMatchOverlay(false)}
        />
      )}

      {/* Preferences sheet */}
      {showPrefs && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPrefs(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto shadow-xl">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h2 className="font-poppins font-semibold text-lg text-gray-800 mb-5">Match Preferences</h2>

            {/* Age range */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium text-gray-700">Age Range</label>
                <span className="text-sm text-blue-600 font-semibold">{minAge} – {maxAge}</span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Minimum: {minAge}</span>
                  </div>
                  <input type="range" min={18} max={79} value={minAge}
                    onChange={e => setMinAge(Math.min(Number(e.target.value), maxAge - 1))}
                    className="w-full accent-blue-600" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Maximum: {maxAge}</span>
                  </div>
                  <input type="range" min={19} max={80} value={maxAge}
                    onChange={e => setMaxAge(Math.max(Number(e.target.value), minAge + 1))}
                    className="w-full accent-blue-600" />
                </div>
              </div>
            </div>

            {/* Religion */}
            <div className="mb-6">
              <label className="text-sm font-medium text-gray-700 block mb-2">Religion Preference</label>
              <div className="flex flex-wrap gap-2">
                {RELIGIONS.map(r => (
                  <button key={r}
                    onClick={() => setPrefReligion(prefReligion === r ? '' : r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${prefReligion === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >{r}</button>
                ))}
              </div>
            </div>

            {/* Countries */}
            <div className="mb-7">
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">Preferred Countries</label>
                {prefCountries.length > 0 && (
                  <button onClick={() => setPrefCountries([])} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-3">Leave empty to match with all countries.</p>
              <div className="grid grid-cols-2 gap-2">
                {COUNTRIES.map(c => (
                  <button key={c.code} onClick={() => toggleCountry(c.name)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${prefCountries.includes(c.name) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                  >
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${prefCountries.includes(c.name) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                      {prefCountries.includes(c.name) ? '✓' : ''}
                    </span>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => savePrefs.mutate()}
              disabled={savePrefs.isLoading}
              className="w-full bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-2xl py-3.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {savePrefs.isLoading ? 'Saving…' : 'Apply Preferences'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
