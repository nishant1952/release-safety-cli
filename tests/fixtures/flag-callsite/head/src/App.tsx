import { flags } from "./flags";
import { Badge } from "./Badge";

const BANNER_TEXT = "New: weekly challenges";

function Banner() {
  const text = BANNER_TEXT.toUpperCase();
  return (
    <div className="banner">
      <Badge label="new" />
      {text}
    </div>
  );
}

export function App() {
  const showBanner = flags.getBooleanValue("weekly-banner", false);
  return (
    <main>
      {showBanner ? <Banner /> : null}
      <h1>Home</h1>
    </main>
  );
}
