import { Link, useLocation } from "@tanstack/react-router";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<React.ComponentProps<typeof Link>, "className" | "to"> {
  to: string;
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, to, ...props }, ref) => {
    const location = useLocation();
    const isActive = location.pathname === to || location.pathname.startsWith(`${to}/`);
    return (
      <Link
        ref={ref}
        to={to as never}
        className={cn(className, isActive && activeClassName)}
        {...(props as object)}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
