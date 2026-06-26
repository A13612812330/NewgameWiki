import { NavLink, Route, Routes } from "react-router-dom";
import { BarChart3, Database, Gamepad2, Gift, Home, Monitor, Search, Settings } from "lucide-react";
import HomePage from "./pages/HomePage.jsx";
import MobilePage from "./pages/MobilePage.jsx";
import PcPage from "./pages/PcPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import WelfarePage from "./pages/WelfarePage.jsx";
import SearchPage from "./pages/SearchPage.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="brand" to="/">
          <span className="brand-icon"><BarChart3 size={22} /></span>
          <span>
            <strong>NewgameWiki</strong>
            <small>游戏资讯池与后台控制台</small>
          </span>
        </NavLink>
        <nav className="main-nav" aria-label="主导航">
          <NavLink to="/" end><Home size={17} />首页</NavLink>
          <NavLink to="/mobile"><Gamepad2 size={17} />手游</NavLink>
          <NavLink to="/welfare"><Gift size={17} />福利</NavLink>
          <NavLink to="/pc"><Monitor size={17} />端游/PC</NavLink>
          <NavLink to="/search"><Search size={17} />搜索</NavLink>
          <NavLink to="/admin"><Settings size={17} />后台</NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/mobile" element={<MobilePage />} />
        <Route path="/welfare" element={<WelfarePage />} />
        <Route path="/pc" element={<PcPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>

      <footer className="app-footer">
        <Database size={16} />
        <span>当前已接入手游真实数据，后台可继续整理来源、清洗结果与手游池详情。</span>
      </footer>
    </div>
  );
}



