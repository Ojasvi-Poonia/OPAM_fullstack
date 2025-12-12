function Alert({ type, message, onClose }) {
  const iconMap = {
    success: 'bi-check-circle',
    danger: 'bi-exclamation-triangle',
    warning: 'bi-exclamation-circle',
    info: 'bi-info-circle'
  }

  return (
    <div className={`alert alert-${type} alert-dismissible fade show`} role="alert">
      <i className={`bi ${iconMap[type] || iconMap.info}`}></i> {message}
      <button type="button" className="btn-close" onClick={onClose}></button>
    </div>
  )
}

export default Alert
