import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: '⬡' },
  { to: '/agents', label: 'Agents', icon: '⚙' },
  { to: '/workflows', label: 'Workflows', icon: '⇄' },
];

export function Layout(){
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <span className="text-lg font-bold text-brand-700">MAOF</span>
          <p className="text-xs text-gray-500 mt-0.5">Multi-Agent Orchestration</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
          <button
            onClick={logout}
            className="mt-1 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
