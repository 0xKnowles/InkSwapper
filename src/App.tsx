import { useState } from "react";
import { DeviceProvider } from "./context/DeviceContext";
import { AppShell, type Section } from "./components/AppShell";
import { Dashboard } from "./components/dashboard/Dashboard";
import { FlashOSWizard } from "./components/flashos/FlashOSWizard";
import { SleepScreenEditor } from "./components/sleep/SleepScreenEditor";
import { LibraryBrowser } from "./components/library/LibraryBrowser";
import { CleanUpBooks } from "./components/cleanup/CleanUpBooks";

function App() {
  const [section, setSection] = useState<Section>("dashboard");

  return (
    <DeviceProvider>
      <AppShell activeSection={section} onNavigate={setSection}>
        {section === "dashboard" && <Dashboard onNavigate={setSection} />}
        {section === "flash-os" && <FlashOSWizard />}
        {section === "sleep-screens" && <SleepScreenEditor />}
        {section === "library" && <LibraryBrowser />}
        {section === "cleanup" && <CleanUpBooks />}
      </AppShell>
    </DeviceProvider>
  );
}

export default App;
