import { useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { BarChart3, Database, Gamepad2, Gift, Home, Monitor, Newspaper, Search, Settings } from "lucide-react";
import HomePage from "./pages/HomePage.jsx";
import MobilePage from "./pages/MobilePage.jsx";
import PcPage from "./pages/PcPage.jsx";
import NewsPage from "./pages/NewsPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import WelfarePage from "./pages/WelfarePage.jsx";
import GlobalSearch from "./components/GlobalSearch.jsx";
import { useGameData } from "./data/useGameData.js";

export default function App() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { updateAvailable, refreshUpdatedData, loading } = useGameData();

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to="/">
          <span className="brand-icon"><BarChart3 size={18} /></span>
          <strong>NewgameWiki</strong>
        </NavLink>
        <nav className="main-nav" aria-label="主导航">
          <NavLink to="/" end><Home size={15} />首页</NavLink>
          <NavLink to="/mobile"><Gamepad2 size={15} />手游</NavLink>
          <NavLink to="/welfare"><Gift size={15} />福利</NavLink>
          <NavLink to="/pc"><Monitor size={15} />端游</NavLink>
          <NavLink to="/news"><Newspaper size={15} />资讯</NavLink>
          <button className="global-search-button" type="button" onClick={() => setSearchOpen(true)}><Search size={15} />搜索</button>
          <NavLink to="/admin"><Settings size={15} />后台</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/mobile" element={<MobilePage />} />
        <Route path="/welfare" element={<WelfarePage />} />
        <Route path="/pc" element={<PcPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/search" element={<Navigate to="/" replace />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      {updateAvailable ? <div className="data-update-prompt" role="status">
        <span>数据已更新，点击刷新</span>
        <button type="button" disabled={loading} onClick={() => refreshUpdatedData().catch(() => {})}>{loading ? "刷新中" : "刷新"}</button>
      </div> : null}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <footer className="app-footer"><Database size={15} /><span>SQLite 主数据源，current.json 作为前端快照与恢复兜底。</span></footer>
    </div>
  );
}
