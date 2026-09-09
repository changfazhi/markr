import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { AccountMenu } from './AccountMenu'

const BRICOLAGE = "'Bricolage Grotesque', sans-serif"

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: '/roadmap', label: 'Topics', end: true },
  { to: '/history', label: 'History' },
  { to: '/starred', label: 'Starred' },
  { to: '/review', label: 'Review' },
]

export function Header() {
  const { user, tier, openLoginModal, openUpgradeModal, openFeedbackModal } = useAuth()

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{ background: 'rgba(11,14,32,.82)', borderColor: '#1c2140' }}
    >
      {/* Below `sm` the row wraps and the nav drops to a line of its own. All three groups
          on one line don't fit a phone: the actions alone are ~320px of a 357px screen, so
          sharing that line left the nav a 1px sliver. Nothing here may become a scroll
          container, though — `overflow-x` other than `visible` forces `overflow-y` to
          compute to `auto` as well, and that clipped AccountMenu's dropdown (which hangs
          below this 56px box) down to a few pixels, putting Profile and Sign out out of
          reach. The nav is the one safe place for it: no popovers live inside it. */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 sm:py-0 sm:h-14 flex flex-wrap sm:flex-nowrap items-center gap-x-3 sm:gap-x-6">
        {/* Logo — matches the landing-page wordmark */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="flex items-center justify-center rounded-[10px] text-white"
            style={{
              width: 32,
              height: 32,
              fontSize: 18,
              fontWeight: 800,
              fontFamily: BRICOLAGE,
              background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
            }}
          >
            π
          </div>
          <span
            className="hidden sm:inline text-lg font-extrabold tracking-tight text-white"
            style={{ fontFamily: BRICOLAGE }}
          >
            Mark<span style={{ color: '#7c83ff' }}>r</span>
          </span>
        </Link>

        <nav className="order-last sm:order-none w-full sm:w-auto min-w-0 overflow-x-auto mt-1.5 sm:mt-0 flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-2 sm:px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'text-white bg-white/10'
                    : 'text-[#aab0d6] hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 shrink-0 pl-2">
          <button
            onClick={() => (user ? openFeedbackModal() : openLoginModal({ message: 'Sign in to send feedback' }))}
            className="px-2 sm:px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap text-[#aab0d6] hover:text-white transition-colors"
          >
            Feedback
          </button>

          {user && tier === 'free' && (
            <button
              onClick={openUpgradeModal}
              className="px-4 py-2 rounded-[11px] text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 8px 18px -6px rgba(245,158,11,0.5)' }}
            >
              ✦ Get Premium
            </button>
          )}

          {user && tier === 'paid' && (
            <button
              onClick={openUpgradeModal}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              style={{ color: '#f59e0b' }}
              title="Extend, switch, or manage your subscription"
            >
              ✦ Premium
            </button>
          )}

          {user ? (
            <AccountMenu />
          ) : (
            <button
              onClick={() => openLoginModal()}
              className="px-4 py-2 rounded-[11px] text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: '#4f46e5', boxShadow: '0 8px 18px -6px #4f46e5' }}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
