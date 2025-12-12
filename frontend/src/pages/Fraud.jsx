import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import api from '../services/api'

function Fraud() {
  const [flaggedTransactions, setFlaggedTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const { showAlert } = useOutletContext()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const response = await api.get('/fraud')
      setFlaggedTransactions(response.data.flaggedTransactions || [])
    } catch (error) {
      showAlert('danger', 'Failed to load fraud data')
    } finally {
      setLoading(false)
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

  const criticalCount = flaggedTransactions.filter(t => t.risk_level === 'Critical').length
  const highCount = flaggedTransactions.filter(t => t.risk_level === 'High').length
  const mediumCount = flaggedTransactions.filter(t => t.risk_level === 'Medium').length

  const getRowClass = (level) => {
    if (level === 'Critical') return 'table-danger'
    if (level === 'High') return 'table-warning'
    return ''
  }

  return (
    <>
      <h2 className="mb-4"><i className="bi bi-shield-exclamation"></i> Fraud Detection</h2>

      <div className="alert alert-info mb-4">
        <i className="bi bi-info-circle"></i>{' '}
        Transactions are automatically analyzed for unusual patterns. High-risk transactions are flagged based on spending habits.
      </div>

      {flaggedTransactions.length > 0 ? (
        <>
          <div className="card">
            <div className="card-header bg-warning">
              <h5 className="mb-0"><i className="bi bi-exclamation-triangle"></i> Flagged Transactions ({flaggedTransactions.length})</h5>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Merchant</th>
                      <th>Amount</th>
                      <th>Fraud Score</th>
                      <th>Risk Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedTransactions.map(t => (
                      <tr key={t.id} className={getRowClass(t.risk_level)}>
                        <td>{new Date(t.date).toLocaleDateString()}</td>
                        <td><span className="badge bg-secondary">{t.category}</span></td>
                        <td>{t.merchant}</td>
                        <td className="fw-bold">{t.amount.toLocaleString()}</td>
                        <td>
                          <div className="progress" style={{ height: '20px', width: '100px' }}>
                            <div
                              className={`progress-bar ${t.fraud_score > 70 ? 'bg-danger' : 'bg-warning'}`}
                              style={{ width: `${t.fraud_score}%` }}
                            >
                              {Math.round(t.fraud_score)}%
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge fs-6 bg-${t.risk_level === 'Critical' ? 'danger' : t.risk_level === 'High' ? 'warning' : 'info'}`}>
                            {t.risk_level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="row mt-4">
            <div className="col-md-4">
              <div className="card text-center">
                <div className="card-body">
                  <h3 className="text-danger">{criticalCount}</h3>
                  <p className="text-muted mb-0">Critical Risk</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card text-center">
                <div className="card-body">
                  <h3 className="text-warning">{highCount}</h3>
                  <p className="text-muted mb-0">High Risk</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card text-center">
                <div className="card-body">
                  <h3 className="text-info">{mediumCount}</h3>
                  <p className="text-muted mb-0">Medium Risk</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="card-body text-center py-5">
            <i className="bi bi-shield-check text-success fs-1"></i>
            <h4 className="mt-3">All Clear!</h4>
            <p className="text-muted">No suspicious transactions detected. Your spending patterns look normal.</p>
          </div>
        </div>
      )}
    </>
  )
}

export default Fraud
