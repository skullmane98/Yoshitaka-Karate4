import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import ProtectedRoute from "@/components/ProtectedRoute";

import Home from "@/pages/Home";
import About from "@/pages/About";
import Programs from "@/pages/Programs";
import Schedule from "@/pages/Schedule";
import News from "@/pages/News";
import Contact from "@/pages/Contact";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import OAuthComplete from "@/pages/OAuthComplete";
import OAuthDone from "@/pages/OAuthDone";
import { BlogList, BlogPost } from "@/pages/Blog";
import StudentDashboard from "@/pages/dashboard/StudentDashboard";
import AdminDashboard from "@/pages/dashboard/AdminDashboard";
import SuperAdminDashboard from "@/pages/dashboard/SuperAdminDashboard";
import StatusPage from "@/pages/Status";

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
      <LanguageProvider>
        <AuthProvider>
        <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--dojo-paper)",
              border: "1px solid var(--dojo-border)",
              color: "var(--dojo-ink)",
              borderRadius: "2px",
              fontFamily: "Outfit, sans-serif",
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/news" element={<News />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/oauth/complete" element={<OAuthComplete />} />
          <Route path="/oauth/done" element={<OAuthDone />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/status" element={<StatusPage />} />

          <Route
            path="/dashboard/student"
            element={
              <ProtectedRoute roles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute roles={["admin", "renshi", "sensei", "team_member"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/super-admin"
            element={
              <ProtectedRoute roles={["super_admin"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
