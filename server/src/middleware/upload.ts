// Multer config — file size limit and MIME type validation
// Full implementation in the modules upload task

import multer from 'multer'

// Stub: wired up in later task (modules route)
const upload = multer({ dest: 'uploads/' })

export default upload
