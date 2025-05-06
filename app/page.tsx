import Hero from "@/components/hero";

export default async function Home() {
  return (
    <>
      <Hero />
      <main className="flex-1 flex flex-col gap-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 bg">
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-medium mb-2">🕹️ Real-Time Debates</h3>
            <p className="text-muted-foreground">
              Dive into fast-paced caption battles where one image doesn’t belong. Play to win and underhand your competition. 
            </p>
          </div>
          
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-medium mb-2">🧑👩‍🦰👨‍🦱 Anonymous games with friends </h3>
            <p className="text-muted-foreground">
              Create your profile, add your friends and play with them anonymously, collect wins and scheme your way to the top of the leaderboard.           
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
