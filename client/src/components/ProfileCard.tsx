import { MatchCandidate } from '@/types';

interface ProfileCardProps {
  user: MatchCandidate;
  onLike: () => void;
  onPass: () => void;
}

export default function ProfileCard({ user, onLike, onPass }: ProfileCardProps) {
  if (!user) return null;

  const interests = user.interests || [];
  const shared = (user.sharedInterests || []).map(s => s.toLowerCase().trim());
  const reason = user.compatibilityReason;

  return (
    <div className="relative bg-white rounded-2xl shadow-lg overflow-hidden mb-5">
      {/* Photo */}
      <div className="relative">
        <img
          src={
            user.profilePicture && !user.profilePicture.startsWith('uploaded:')
              ? user.profilePicture
              : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.firstName || 'User')}&size=400&background=1565c0&color=fff`
          }
          alt={`${user.firstName}'s photo`}
          className="w-full h-96 object-cover"
        />

        {/* Gradient name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/30 to-transparent text-white">
          <div className="flex items-center gap-2">
            <h2 className="font-poppins text-2xl font-bold">
              {user.firstName}{user.age ? `, ${user.age}` : ''}
            </h2>
            {user.isVerified && (
              <span className="bg-blue-500 rounded-full p-0.5 shrink-0">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </div>
          <p className="text-white/75 text-sm mt-0.5">
            {[user.location, user.country].filter(Boolean).join(', ') || 'Location unknown'}
            {user.religion ? ` · ${user.religion}` : ''}
          </p>
        </div>

        {user.profileVideo && (
          <div className="absolute top-3 right-3 bg-blue-900/90 text-white rounded-full px-2.5 py-1 text-xs font-medium flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            Video
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-5 space-y-4">
        {/* Intention badge */}
        {user.intention && (
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            user.intention === 'marriage'
              ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
              : user.intention === 'long-term'
              ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              : 'bg-green-50 text-green-700 ring-1 ring-green-200'
          }`}>
            {user.intention === 'marriage' ? '💍' : user.intention === 'long-term' ? '💛' : '🌱'}
            {user.intention === 'marriage' ? 'Looking for marriage' : user.intention === 'long-term' ? 'Long-term relationship' : 'Getting to know someone'}
          </div>
        )}

        {/* Connection reason */}
        {reason && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            <p className="text-xs text-blue-700 font-medium leading-snug">{reason}</p>
          </div>
        )}

        {/* Bio */}
        {user.aboutMe && (
          <p className="text-gray-600 text-sm leading-relaxed">{user.aboutMe}</p>
        )}

        {/* Interests — shared ones highlighted */}
        {interests.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Interests</h3>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest, i) => {
                const isShared = shared.includes(interest.toLowerCase().trim());
                return (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      isShared
                        ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {isShared && '✓ '}{interest}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-around pt-2">
          <button
            onClick={onPass}
            aria-label="Pass"
            className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-400 transition-colors shadow-sm"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <button
            onClick={onLike}
            aria-label="Like"
            className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center text-white shadow-lg hover:from-blue-800 hover:to-blue-600 transition-colors"
          >
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
