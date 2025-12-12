import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Alert from './Alert'
import { useState } from 'react'

function Layout() {
  const [alert, setAlert] = useState(null)

  const showAlert = (type, message) => {
    setAlert({ type, message })
    setTimeout(() => setAlert(null), 5000)
  }

  return (
    <>
      <Sidebar />
      <div className="main-content">
        {alert && (
          <Alert
            type={alert.type}
            message={alert.message}
            onClose={() => setAlert(null)}
          />
        )}
        <Outlet context={{ showAlert }} />
      </div>
    </>
  )
}

export default Layout
