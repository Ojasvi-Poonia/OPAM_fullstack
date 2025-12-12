import { useState, useEffect, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import api from '../services/api'

const CATEGORIES = [
  'Food & Dining', 'Transportation', 'Shopping', 'Entertainment',
  'Groceries', 'Healthcare', 'Utilities', 'Education',
  'Personal Care', 'Travel', 'Subscriptions', 'Bills & Payments', 'Other'
]

const PAYMENT_METHODS = ['UPI', 'Credit Card', 'Debit Card', 'Cash', 'Net Banking']

function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    category: CATEGORIES[0],
    merchant: '',
    description: '',
    payment_method: PAYMENT_METHODS[0],
    date: new Date().toISOString().split('T')[0],
    is_recurring: false
  })
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  const dropZoneRef = useRef(null)
  const { showAlert } = useOutletContext()

  useEffect(() => {
    loadTransactions()
  }, [currentPage, selectedCategory])

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: currentPage })
      if (selectedCategory) params.append('category', selectedCategory)
      const response = await api.get(`/transactions?${params}`)
      setTransactions(response.data.transactions)
      setTotalPages(response.data.totalPages)
    } catch (error) {
      showAlert('danger', 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleAddTransaction = async (e) => {
    e.preventDefault()
    try {
      const response = await api.post('/transactions', formData)
      if (response.ok) {
        showAlert('success', 'Transaction added successfully')
        setShowAddModal(false)
        setFormData({
          amount: '',
          category: CATEGORIES[0],
          merchant: '',
          description: '',
          payment_method: PAYMENT_METHODS[0],
          date: new Date().toISOString().split('T')[0],
          is_recurring: false
        })
        loadTransactions()
      } else {
        showAlert('danger', response.data.error || 'Failed to add transaction')
      }
    } catch (error) {
      showAlert('danger', 'Failed to add transaction')
    }
  }

  const handleDeleteTransaction = async (id) => {
    if (!confirm('Delete this transaction?')) return
    try {
      await api.delete(`/transactions/${id}`)
      showAlert('success', 'Transaction deleted')
      loadTransactions()
    } catch (error) {
      showAlert('danger', 'Failed to delete transaction')
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    dropZoneRef.current?.classList.add('border-primary', 'bg-primary', 'bg-opacity-10')
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    dropZoneRef.current?.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    dropZoneRef.current?.classList.remove('border-primary', 'bg-primary', 'bg-opacity-10')
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].name.endsWith('.csv')) {
      setImportFile(files[0])
    } else {
      showAlert('danger', 'Please drop a CSV file')
    }
  }

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setImportFile(e.target.files[0])
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleImport = async (e) => {
    e.preventDefault()
    if (!importFile) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('csvFile', importFile)
      const response = await api.upload('/transactions/import', formData)
      if (response.ok) {
        showAlert('success', response.data.message || 'Import successful')
        setShowImportModal(false)
        setImportFile(null)
        loadTransactions()
      } else {
        showAlert('danger', response.data.error || 'Import failed')
      }
    } catch (error) {
      showAlert('danger', 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const getRiskBadgeClass = (level) => {
    switch (level) {
      case 'Critical': return 'bg-danger'
      case 'High': return 'bg-warning'
      case 'Medium': return 'bg-info'
      default: return 'bg-success'
    }
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2><i className="bi bi-list-ul"></i> Transactions</h2>
        <div>
          <button className="btn btn-outline-primary me-2" onClick={() => setShowImportModal(true)}>
            <i className="bi bi-upload"></i> Import CSV
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <i className="bi bi-plus-lg"></i> Add Transaction
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label">Filter by Category</label>
              <select
                className="form-select"
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1) }}
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Risk</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center py-4">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </td>
                  </tr>
                ) : transactions.length > 0 ? (
                  transactions.map(t => (
                    <tr key={t.id}>
                      <td>{new Date(t.date).toLocaleDateString()}</td>
                      <td><span className="badge bg-secondary">{t.category}</span></td>
                      <td>{t.merchant}</td>
                      <td className="fw-bold">{t.amount.toLocaleString()}</td>
                      <td><small>{t.payment_method}</small></td>
                      <td>
                        <span className={`badge ${getRiskBadgeClass(t.risk_level)}`}>
                          {t.risk_level}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => handleDeleteTransaction(t.id)}
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center py-4 text-muted">
                      <i className="bi bi-inbox fs-1"></i>
                      <p className="mt-2">No transactions yet</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-4">
          <ul className="pagination justify-content-center">
            <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => setCurrentPage(p => p - 1)}>Previous</button>
            </li>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <li key={p} className={`page-item ${p === currentPage ? 'active' : ''}`}>
                <button className="page-link" onClick={() => setCurrentPage(p)}>{p}</button>
              </li>
            ))}
            <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => setCurrentPage(p => p + 1)}>Next</button>
            </li>
          </ul>
        </nav>
      )}

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <form onSubmit={handleAddTransaction}>
                <div className="modal-header">
                  <h5 className="modal-title"><i className="bi bi-plus-circle"></i> Add Transaction</h5>
                  <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Amount *</label>
                    <div className="input-group">
                      <span className="input-group-text">&#8377;</span>
                      <input
                        type="number"
                        name="amount"
                        className="form-control"
                        value={formData.amount}
                        onChange={handleInputChange}
                        required
                        min="1"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Category *</label>
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
                    <label className="form-label">Merchant</label>
                    <input
                      type="text"
                      name="merchant"
                      className="form-control"
                      value={formData.merchant}
                      onChange={handleInputChange}
                      placeholder="Store name"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      name="description"
                      className="form-control"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Notes"
                    />
                  </div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Payment Method</label>
                      <select
                        name="payment_method"
                        className="form-select"
                        value={formData.payment_method}
                        onChange={handleInputChange}
                      >
                        {PAYMENT_METHODS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Date *</label>
                      <input
                        type="date"
                        name="date"
                        className="form-control"
                        value={formData.date}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-check">
                    <input
                      type="checkbox"
                      name="is_recurring"
                      className="form-check-input"
                      id="recurring"
                      checked={formData.is_recurring}
                      onChange={handleInputChange}
                    />
                    <label className="form-check-label" htmlFor="recurring">Recurring expense</label>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Add Transaction</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <form onSubmit={handleImport}>
                <div className="modal-header">
                  <h5 className="modal-title"><i className="bi bi-file-earmark-spreadsheet"></i> Import Transactions from CSV</h5>
                  <button type="button" className="btn-close" onClick={() => { setShowImportModal(false); setImportFile(null) }}></button>
                </div>
                <div className="modal-body">
                  {!importFile ? (
                    <div
                      ref={dropZoneRef}
                      className="border border-2 border-dashed rounded p-5 text-center mb-3"
                      style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <i className="bi bi-cloud-upload fs-1 text-muted"></i>
                      <p className="mt-2 mb-1">Drag and drop your CSV file here</p>
                      <p className="text-muted small">or click to browse</p>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv"
                        className="d-none"
                        onChange={handleFileSelect}
                      />
                    </div>
                  ) : (
                    <div className="alert alert-info">
                      <i className="bi bi-file-earmark-check"></i>
                      <span className="ms-2">{importFile.name} ({formatFileSize(importFile.size)})</span>
                      <button type="button" className="btn-close float-end" onClick={() => setImportFile(null)}></button>
                    </div>
                  )}

                  <div className="alert alert-secondary">
                    <h6><i className="bi bi-info-circle"></i> CSV Format Requirements</h6>
                    <p className="small mb-2">Your CSV file should have these columns (required fields marked with *):</p>
                    <ul className="small mb-0">
                      <li><strong>date*</strong> - Transaction date (YYYY-MM-DD format preferred)</li>
                      <li><strong>amount*</strong> - Transaction amount (numeric)</li>
                      <li><strong>category*</strong> - Category name (e.g., Food & Dining, Shopping, etc.)</li>
                      <li><strong>merchant</strong> - Store/vendor name (optional)</li>
                      <li><strong>description</strong> - Notes (optional)</li>
                      <li><strong>payment_method</strong> - UPI, Credit Card, Debit Card, Cash, Net Banking (optional)</li>
                      <li><strong>is_recurring</strong> - 1 or true for recurring expenses (optional)</li>
                    </ul>
                  </div>

                  <details className="mb-0">
                    <summary className="text-primary small" style={{ cursor: 'pointer' }}>View sample CSV format</summary>
                    <pre className="bg-dark text-light p-2 rounded mt-2 small">
{`date,amount,category,merchant,description,payment_method
2024-01-15,500,Food & Dining,Swiggy,Lunch order,UPI
2024-01-16,2500,Shopping,Amazon,Electronics,Credit Card
2024-01-17,150,Transportation,Uber,Office commute,UPI`}
                    </pre>
                  </details>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowImportModal(false); setImportFile(null) }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={!importFile || importing}>
                    {importing ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Importing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-upload"></i> Import Transactions
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Transactions
