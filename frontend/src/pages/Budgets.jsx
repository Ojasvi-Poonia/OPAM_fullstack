import { useState, useEffect } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = [
  'Food & Dining', 'Transportation', 'Shopping', 'Entertainment',
  'Groceries', 'Healthcare', 'Utilities', 'Education',
  'Personal Care', 'Travel', 'Subscriptions', 'Bills & Payments', 'Other'
]

function Budgets() {
  const [budgets, setBudgets] = useState([])
  const [spendingMap, setSpendingMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    category: CATEGORIES[0],
    monthly_limit: ''
  })
  const { user } = useAuth()
  const { showAlert } = useOutletContext()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const response = await api.get('/budgets')
      setBudgets(response.data.budgets || [])
      setSpendingMap(response.data.spendingMap || {})
    } catch (error) {
      showAlert('danger', 'Failed to load budgets')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const response = await api.post('/budgets', formData)
      if (response.ok) {
        showAlert('success', 'Budget updated')
        setShowModal(false)
        setFormData({ category: CATEGORIES[0], monthly_limit: '' })
        loadData()
      } else {
        showAlert('danger', response.data.error || 'Failed to save budget')
      }
    } catch (error) {
      showAlert('danger', 'Failed to save budget')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/budgets/${id}`)
      showAlert('success', 'Budget deleted')
      loadData()
    } catch (error) {
      showAlert('danger', 'Failed to delete budget')
    }
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  const totalSpent = Object.values(spendingMap).reduce((a, b) => a + b, 0)
  const overallBudget = user?.monthly_budget || 50000
  const overallPercent = Math.min(100, (totalSpent / overallBudget) * 100)
  const overallClass = overallPercent > 90 ? 'bg-danger' : overallPercent > 70 ? 'bg-warning' : 'bg-success'

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2><i className="bi bi-piggy-bank"></i> Budget Management</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <i className="bi bi-plus-lg"></i> Set Budget
        </button>
      </div>

      {/* Overall Budget */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0"><i className="bi bi-wallet"></i> Overall Monthly Budget</h5>
        </div>
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-8">
              <div className="d-flex justify-content-between mb-2">
                <span>Total spent this month</span>
                <span className="fw-bold">{totalSpent.toLocaleString()} / {overallBudget.toLocaleString()}</span>
              </div>
              <div className="progress" style={{ height: '30px' }}>
                <div
                  className={`progress-bar ${overallClass}`}
                  style={{ width: `${overallPercent}%` }}
                >
                  {Math.round(overallPercent)}%
                </div>
              </div>
            </div>
            <div className="col-md-4 text-end">
              <Link to="/settings" className="btn btn-outline-primary">
                <i className="bi bi-gear"></i> Change Budget
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Category Budgets */}
      <div className="card">
        <div className="card-header">
          <h5 className="mb-0"><i className="bi bi-tags"></i> Category Budgets</h5>
        </div>
        <div className="card-body">
          {budgets.length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Budget</th>
                    <th>Spent</th>
                    <th>Progress</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.map(b => {
                    const spent = spendingMap[b.category] || 0
                    const percent = (spent / b.monthly_limit) * 100
                    const progressClass = percent > 100 ? 'bg-danger' : percent > 80 ? 'bg-warning' : 'bg-success'

                    return (
                      <tr key={b.id}>
                        <td><span className="badge bg-secondary">{b.category}</span></td>
                        <td>{b.monthly_limit.toLocaleString()}</td>
                        <td>{spent.toLocaleString()}</td>
                        <td style={{ width: '30%' }}>
                          <div className="progress">
                            <div
                              className={`progress-bar ${progressClass}`}
                              style={{ width: `${Math.min(100, percent)}%` }}
                            >
                              {Math.round(percent)}%
                            </div>
                          </div>
                          {percent > 100 && <small className="text-danger">Over budget!</small>}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(b.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-muted py-4">
              <i className="bi bi-piggy-bank fs-1"></i>
              <p className="mt-2">No category budgets set</p>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                Set Your First Budget
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Budget Modal */}
      {showModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={handleSubmit}>
                <div className="modal-header">
                  <h5 className="modal-title"><i className="bi bi-piggy-bank"></i> Set Category Budget</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Category</label>
                    <select
                      name="category"
                      className="form-select"
                      value={formData.category}
                      onChange={handleInputChange}
                      required
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Monthly Limit</label>
                    <div className="input-group">
                      <span className="input-group-text">&#8377;</span>
                      <input
                        type="number"
                        name="monthly_limit"
                        className="form-control"
                        value={formData.monthly_limit}
                        onChange={handleInputChange}
                        required
                        min="100"
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Budget</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Budgets
