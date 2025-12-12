import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler } from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler)

function Dashboard() {
  const [stats, setStats] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { showAlert } = useOutletContext()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [statsRes, predRes] = await Promise.all([
        api.get('/stats'),
        api.get('/predictions')
      ])
      setStats(statsRes.data)
      setPredictions(predRes.data)
    } catch (error) {
      showAlert('danger', 'Failed to load dashboard data')
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

  const budget = user?.monthly_budget || 50000
  const budgetPercent = stats ? Math.min(100, (stats.month_spent / budget) * 100) : 0
  const budgetClass = budgetPercent > 90 ? 'bg-danger' : budgetPercent > 70 ? 'bg-warning' : 'bg-success'

  const categoryChartData = {
    labels: stats?.categoryBreakdown?.slice(0, 6).map(c => c.category) || [],
    datasets: [{
      data: stats?.categoryBreakdown?.slice(0, 6).map(c => c.total) || [],
      backgroundColor: ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6f42c1', '#20c997']
    }]
  }

  const trendChartData = {
    labels: stats?.monthlyTrend?.map(t => t.month) || [],
    datasets: [{
      label: 'Spending',
      data: stats?.monthlyTrend?.map(t => t.total) || [],
      borderColor: '#0d6efd',
      backgroundColor: 'rgba(13, 110, 253, 0.1)',
      fill: true,
      tension: 0.3
    }]
  }

  return (
    <>
      <h2 className="mb-4"><i className="bi bi-speedometer2"></i> Dashboard</h2>

      {/* Stats Cards */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="stat-card">
            <div className="stat-icon bg-primary"><i className="bi bi-receipt"></i></div>
            <div className="stat-info">
              <h3>{stats?.total_transactions?.toLocaleString() || 0}</h3>
              <p>Total Transactions</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="stat-card">
            <div className="stat-icon bg-success"><i className="bi bi-currency-rupee"></i></div>
            <div className="stat-info">
              <h3>{Math.round(stats?.total_spent || 0).toLocaleString()}</h3>
              <p>Total Spent</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="stat-card">
            <div className="stat-icon bg-warning"><i className="bi bi-calendar-month"></i></div>
            <div className="stat-info">
              <h3>{Math.round(stats?.month_spent || 0).toLocaleString()}</h3>
              <p>This Month</p>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="stat-card">
            <div className="stat-icon bg-info"><i className="bi bi-graph-up"></i></div>
            <div className="stat-info">
              <h3>{Math.round(stats?.avg_transaction || 0).toLocaleString()}</h3>
              <p>Avg Transaction</p>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Progress */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0"><i className="bi bi-piggy-bank"></i> Monthly Budget</h5>
        </div>
        <div className="card-body">
          <div className="d-flex justify-content-between mb-2">
            <span>{Math.round(stats?.month_spent || 0).toLocaleString()} spent</span>
            <span>{budget.toLocaleString()} budget</span>
          </div>
          <div className="progress" style={{ height: '25px' }}>
            <div
              className={`progress-bar ${budgetClass}`}
              style={{ width: `${budgetPercent}%` }}
            >
              {Math.round(budgetPercent)}%
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Prediction Card */}
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h5 className="mb-0"><i className="bi bi-magic"></i> Next Month Prediction</h5>
            </div>
            <div className="card-body">
              {predictions?.prediction > 0 ? (
                <div className="text-center py-3">
                  <h2 className="text-primary mb-2">{predictions.prediction.toLocaleString()}</h2>
                  <p className="text-muted mb-3">Predicted spending</p>
                  <span className={`badge fs-6 bg-${predictions.trend === 'increasing' ? 'danger' : predictions.trend === 'decreasing' ? 'success' : 'secondary'}`}>
                    <i className={`bi bi-arrow-${predictions.trend === 'increasing' ? 'up' : predictions.trend === 'decreasing' ? 'down' : 'right'}`}></i>
                    {' '}{predictions.trend?.charAt(0).toUpperCase() + predictions.trend?.slice(1)} trend
                  </span>
                  <div className="mt-3">
                    <small className="text-muted">Confidence: {predictions.confidence}%</small>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted py-4">
                  <i className="bi bi-info-circle fs-1"></i>
                  <p className="mt-2">Add more transactions to enable predictions</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header">
              <h5 className="mb-0"><i className="bi bi-pie-chart"></i> Top Categories</h5>
            </div>
            <div className="card-body">
              {stats?.categoryBreakdown?.length > 0 ? (
                <Doughnut
                  data={categoryChartData}
                  options={{ plugins: { legend: { position: 'right' } } }}
                />
              ) : (
                <div className="text-center text-muted py-4">
                  <i className="bi bi-pie-chart fs-1"></i>
                  <p className="mt-2">No spending data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      {stats?.monthlyTrend?.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <h5 className="mb-0"><i className="bi bi-graph-up"></i> Monthly Spending Trend</h5>
          </div>
          <div className="card-body">
            <Line
              data={trendChartData}
              options={{
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}

export default Dashboard
