import { useState, useEffect } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import api from '../services/api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

function Predictions() {
  const [predictions, setPredictions] = useState(null)
  const [categoryPredictions, setCategoryPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const { showAlert } = useOutletContext()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const response = await api.get('/predictions')
      setPredictions(response.data.predictions)
      setCategoryPredictions(response.data.categoryPredictions || [])
    } catch (error) {
      showAlert('danger', 'Failed to load predictions')
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

  const historyChartData = {
    labels: predictions?.history?.map(h => h.month) || [],
    datasets: [{
      label: 'Monthly Spending',
      data: predictions?.history?.map(h => h.total) || [],
      backgroundColor: '#0d6efd'
    }]
  }

  return (
    <>
      <h2 className="mb-4"><i className="bi bi-graph-up-arrow"></i> Expense Predictions</h2>

      <div className="row g-4">
        {/* Next Month Prediction */}
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0"><i className="bi bi-magic"></i> Next Month Forecast</h5>
            </div>
            <div className="card-body">
              {predictions?.prediction > 0 ? (
                <div className="text-center py-4">
                  <h1 className="display-4 text-primary mb-3">{predictions.prediction.toLocaleString()}</h1>
                  <p className="lead text-muted">Predicted total spending</p>

                  <div className="d-flex justify-content-center gap-3 my-4">
                    <div className="text-center">
                      <span className={`badge fs-5 p-3 bg-${predictions.trend === 'increasing' ? 'danger' : predictions.trend === 'decreasing' ? 'success' : 'secondary'}`}>
                        <i className={`bi bi-arrow-${predictions.trend === 'increasing' ? 'up' : predictions.trend === 'decreasing' ? 'down' : 'right'}`}></i>
                        {' '}{predictions.trend?.charAt(0).toUpperCase() + predictions.trend?.slice(1)}
                      </span>
                    </div>
                  </div>

                  <div className="progress mb-3" style={{ height: '10px' }}>
                    <div className="progress-bar" style={{ width: `${predictions.confidence}%` }}></div>
                  </div>
                  <small className="text-muted">Model confidence: {predictions.confidence}%</small>
                </div>
              ) : (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-hourglass fs-1"></i>
                  <p className="mt-3">Need more transaction history for accurate predictions</p>
                  <Link to="/transactions" className="btn btn-primary mt-2">Add Transactions</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Historical Trend */}
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h5 className="mb-0"><i className="bi bi-bar-chart"></i> Historical Data</h5>
            </div>
            <div className="card-body">
              {predictions?.history?.length > 0 ? (
                <Bar
                  data={historyChartData}
                  options={{
                    scales: { y: { beginAtZero: true } },
                    plugins: { legend: { display: false } }
                  }}
                />
              ) : (
                <div className="text-center text-muted py-5">
                  <i className="bi bi-bar-chart fs-1"></i>
                  <p className="mt-3">No historical data available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category Predictions */}
      <div className="card mt-4">
        <div className="card-header">
          <h5 className="mb-0"><i className="bi bi-tags"></i> Category Breakdown (Last 3 Months)</h5>
        </div>
        <div className="card-body">
          {categoryPredictions.length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Avg Transaction</th>
                    <th>Frequency</th>
                    <th>Total Spent</th>
                    <th>Monthly Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryPredictions.map((c, idx) => (
                    <tr key={idx}>
                      <td><span className="badge bg-secondary">{c.category}</span></td>
                      <td>{Math.round(c.avg_amount).toLocaleString()}</td>
                      <td>{c.frequency} transactions</td>
                      <td className="fw-bold">{Math.round(c.total).toLocaleString()}</td>
                      <td className="text-primary">{Math.round(c.total / 3).toLocaleString()}/month</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-muted py-4">
              <i className="bi bi-tags fs-1"></i>
              <p className="mt-2">No category data available</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Predictions
