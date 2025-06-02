import Hero from "@/components/hero";

export default async function Home() {
  return (
    <div className="flex flex-col items-center justify-center w-full flex-1 relative">
      {/* Animated dot particles across the entire page */}
      <div className="absolute top-20 left-[15%] w-3 h-3 rounded-full bg-primary/40 animate-float-particle-1"></div>
      <div className="absolute top-[30%] right-[10%] w-2 h-2 rounded-full bg-primary/30 animate-float-particle-2"></div>
      <div className="absolute bottom-[20%] left-[25%] w-4 h-4 rounded-full bg-primary/20 animate-float-particle-3"></div>
      <div className="absolute top-[60%] right-[20%] w-5 h-5 rounded-full bg-primary/10 animate-float-particle-4"></div>
      
      <Hero />
    </div>
  );
}
