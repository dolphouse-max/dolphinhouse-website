// Simple authentication middleware for admin pages
export function isAuthenticated(context) {
  const session = context.cookies.get('admin_session');
  return !!session;
}

export function requireAuth({ cookies, redirect }) {
  const isLoggedIn = !!cookies.get('admin_session');
  
  if (!isLoggedIn) {
    return redirect('/admin/login');
  }
}