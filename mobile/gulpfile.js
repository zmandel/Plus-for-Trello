var gulp = require('gulp');
var concat = require('gulp-concat');
 
gulp.task('default', function() {
    return gulp.src(['./www/sw.tmp', './www/service-worker-extra.js'])
    .pipe(concat('service-worker.js'))
    .pipe(gulp.dest('./www/'));
});