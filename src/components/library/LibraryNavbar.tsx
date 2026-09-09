import { Link, useLocation } from '@tanstack/react-router';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
  const loc = useLocation();
  const active = loc.pathname === to;
  return (
    <Link to={to} className={`px-3 py-2 rounded ${active ? 'bg-primary text-white' : 'hover:bg-muted'}`}>
      {children}
    </Link>
  );
};

const LibraryNavbar = ({ onLogout }: { onLogout?: () => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="hidden md:flex items-center gap-4">
        <NavLink to="/librarian">Dashboard</NavLink>
        <NavLink to="/librarian/books">Books</NavLink>
        <NavLink to="/librarian/members">Members</NavLink>
        <NavLink to="/librarian/issue">Issue Book</NavLink>
        <NavLink to="/librarian/return">Return Book</NavLink>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="px-3 py-2 rounded hover:bg-muted">Reports</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem asChild>
              <Link to="/librarian/reports/issued">Issued Books</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/librarian/reports/overdue">Overdue Books</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="md:hidden px-2 pt-2 pb-3 space-y-1">
        <Link to="/librarian" className="block px-3 py-2 rounded">Dashboard</Link>
        <Link to="/librarian/books" className="block px-3 py-2 rounded">Books</Link>
        <Link to="/librarian/members" className="block px-3 py-2 rounded">Members</Link>
        <Link to="/librarian/issue" className="block px-3 py-2 rounded">Issue Book</Link>
        <Link to="/librarian/return" className="block px-3 py-2 rounded">Return Book</Link>
        <Link to="/librarian/reports/issued" className="block px-3 py-2 rounded">Issued Books</Link>
        <Link to="/librarian/reports/overdue" className="block px-3 py-2 rounded">Overdue Books</Link>
        <button onClick={() => onLogout && onLogout()} className="w-full text-left px-3 py-2">Logout</button>
      </div>
    </>
  );
};

export default LibraryNavbar;
