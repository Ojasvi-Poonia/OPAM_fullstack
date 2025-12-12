import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

function Settings() {
  const { user, updateUser } = useAuth()
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    monthly_budget: user?.monthly_budget || 50000
  })
  const [saving, setSaving] = useState(false)
  const { showAlert } = useOutletContext()

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await api.post('/settings', formData)
      if (response.ok) {
        updateUser({
          full_name: formData.full_name,
          monthly_budget: parseFloat(formData.monthly_budget)
        })
        showAlert('success', 'Settings updated')
      } else {
        showAlert('danger', response.data.error || 'Failed to update settings')
      }
    } catch (error) {
      showAlert('danger', 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h2 className="mb-4"><i className="bi bi-gear"></i> Settings</h2>

      <div className="row">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0"><i className="bi bi-person"></i> Profile Settings</h5>
            </div>
            <div className="card-body">
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Username</label>
                  <input type="text" className="form-control" value={user?.username || ''} disabled />
                  <small className="text-muted">Username cannot be changed</small>
                </div>

                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={user?.email || ''} disabled />
                </div>

                <div className="mb-3">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    name="full_name"
                    className="form-control"
                    value={formData.full_name}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Monthly Budget</label>
                  <div className="input-group">
                    <span className="input-group-text">&#8377;</span>
                    <input
                      type="number"
                      name="monthly_budget"
                      className="form-control"
                      value={formData.monthly_budget}
                      onChange={handleInputChange}
                      min="1000"
                    />
                  </div>
                  <small className="text-muted">Your target monthly spending limit</small>
                </div>

                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-lg"></i> Save Changes
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0"><i className="bi bi-info-circle"></i> Account Info</h5>
            </div>
            <div className="card-body">
              <table className="table table-borderless">
                <tbody>
                  <tr>
                    <td className="text-muted">Account ID</td>
                    <td className="fw-bold">#{user?.id}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Username</td>
                    <td>{user?.username}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Email</td>
                    <td>{user?.email}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Currency</td>
                    <td>INR (&#8377;)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card mt-4">
            <div className="card-header bg-danger text-white">
              <h5 className="mb-0"><i className="bi bi-exclamation-triangle"></i> Danger Zone</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">Once you delete your account, there is no going back.</p>
              <button className="btn btn-outline-danger" disabled>
                <i className="bi bi-trash"></i> Delete Account
              </button>
              <small className="d-block mt-2 text-muted">Contact support to delete account</small>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default Settings
