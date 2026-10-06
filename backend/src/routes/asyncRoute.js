// Express 4 does not catch rejected promises from async handlers.
function asyncRoute(handler, message, logger = console) {
  return (req, res, next) => Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(error => {
      logger.error('Request failed', req.method, req.path, error)
      if (res.headersSent) return next(error)
      return res.status(500).json({ message })
    })
}

module.exports = { asyncRoute }
