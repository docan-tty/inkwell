import { useEffect } from "react";
import { useAppStore } from "./store";
import { ProjectList } from "./components/ProjectList";
import { Workspace } from "./components/Workspace";

function App() {
  const { view, applyTheme } = useAppStore();

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  return (
    <div className="h-full w-full bg-paper text-ink dark:bg-paper-dark dark:text-ink-dark">
      {view === "projects" ? <ProjectList /> : <Workspace />}
    </div>
  );
}

export default App;
