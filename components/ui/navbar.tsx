import Link from "next/link";
import HeaderAuth from "@/components/header-auth";

export function NavBar() {
  return (
    <nav className="w-full flex justify-center border-b border-border bg-background/80 backdrop-blur-sm relative z-10">
      {/* Navbar fade gradient for smooth transition */}
      <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-b from-transparent to-background/80 -mb-4 z-0"></div>
      
      <div className="absolute inset-0 opacity-5">
        <div className="nav-dots"></div>
      </div>
      
      <div className="w-full max-w-7xl mx-auto flex justify-between items-center p-3 px-5 text-sm h-16 relative z-10">
        <div className="flex gap-5 items-center">
          <Link 
            href={"/"} 
            className="font-bold text-lg relative group flex items-center"
          >
            <span className="game-logo-text">Framed</span>
            <span className="absolute -inset-1 rounded-lg bg-primary/10 scale-0 transition-all duration-300 group-hover:scale-100"></span>
          </Link>
        </div>
        <HeaderAuth />
      </div>
    </nav>
  );
} 