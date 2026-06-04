import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useMatch } from '@/context/MatchContext';
import { useAuth } from '@/context/AuthContext';
import ProfileCard from '@/components/ProfileCard';
import MatchOverlay from '@/components/MatchOverlay';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { COUNTRIES } from '@/lib/countries';
import { MatchCandidate } from '@/types';

const RELIGIONS = ['Christianity', 'Islam', 'Hinduism', 'Buddhism', 'Judaism', 'Sikhism', 'No preference'];

export default function MatchPage() {
  const { potentialMatches, isLoadingMatches, sendLike, sendPass } = useMatch();
  const { user } = useAuth();
  const [showMatchOverlay, setShowMatchOverlay] = useState(false);
  const [matchedUser, setMatchedUser] = useState<MatchCandidate | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);

  const [minAge, setMinAge] = useState(user?.minAgePreference ?? 18);
  const [maxAge, setMaxAge] = useState(user?.maxAgePreference ?? 60);
  const [prefReligion, setPrefReligion] = useState(user?.preferredReligion ?? '');
  const [prefCountries, setPrefCountries] = useState<string[]>(user?.preferredCountries ?? []);

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
      const liked = potentialMatches.find(u => u.id === userId);
      if (liked) {
        setMatchedUser(liked);
        setShowMatchOverlay(true);
      }
    } catch (e) {
      console.error('Like error', e);
    }
  };

  const handlePass = async (userId: number) => {
    try { await sendPass(userId); } catch (e) { console.error('Pass error', e); }
  };

  const toggleCountry = (code: string) => {
    setPrefCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const candidate = potentialMatches[0];

  return (
    <div className="px-4 pb-4">
      {/* Header row */}
      <div className="flex items-center justify-between py-3">
        <div>
          <h1 className="font-poppins font-semibold text-gray-800">Discover</h1>
          {potentialMatches.length > 0 && (
            <p className="text-xs text-gray-400">{potentialMatches.length} potential match{potentialMatches.length > 1 ? 'es' : ''} found</p>
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

      {isLoadingMatches ? (
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-2xl h-96 animate-pulse" />
          <div className="bg-gray-100 rounded-2xl h-28 animate-pulse" />
        </div>
      ) : !candidate ? (
        <div className="bg-white rounded-2xl shadow-md p-8 text-center mt-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 mx-auto flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
            </svg>
          </div>
          <h3 className="font-poppins font-semibold text-lg text-gray-800 mb-2">No matches found</h3>
          <p className="text-gray-500 text-sm mb-4">
            Try widening your age range or removing country filters.
          </p>
          <button
            onClick={() => setShowPrefs(true)}
            className="bg-blue-600 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Adjust Preferences
          </button>
        </div>
      ) : (
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
                    <span>Min age: {minAge}</span><span>18 – 80</span>
                  </div>
                  <input
                    type="range" min={18} max={79} value={minAge}
                    onChange={e => setMinAge(Math.min(Number(e.target.value), maxAge - 1))}
                    className="w-full accent-blue-600"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Max age: {maxAge}</span><span>19 – 80</span>
                  </div>
                  <input
                    type="range" min={19} max={80} value={maxAge}
                    onChange={e => setMaxAge(Math.max(Number(e.target.value), minAge + 1))}
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* Religion preference */}
            <div className="mb-6">
              <label className="text-sm font-medium text-gray-700 block mb-2">Religion Preference</label>
              <div className="flex flex-wrap gap-2">
                {RELIGIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setPrefReligion(prefReligion === r ? '' : r)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      prefReligion === r
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Country preference */}
            <div className="mb-7">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Preferred Countries</label>
                {prefCountries.length > 0 && (
                  <button onClick={() => setPrefCountries([])} className="text-xs text-gray-400 hover:text-gray-600">
                    Clear all
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-3">Leave empty to match with all countries.</p>
              <div className="grid grid-cols-2 gap-2">
                {COUNTRIES.map(c => (
                  <button
                    key={c.code}
                    onClick={() => toggleCountry(c.name)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                      prefCountries.includes(c.name)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px]
                      ${prefCountries.includes(c.name) ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}">
                      {prefCountries.includes(c.name) ? '✓' : ''}
                    </span>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => savePrefs.mutate()}
              disabled={savePrefs.isPending}
              className="w-full bg-gradient-to-r from-blue-800 to-blue-500 text-white rounded-2xl py-3.5 font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {savePrefs.isPending ? 'Saving…' : 'Apply Preferences'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
