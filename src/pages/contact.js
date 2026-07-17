import '../lib/bootstrap.js';

(function () {
  window.addEventListener('load', function () {
    document.querySelectorAll('.page-fade').forEach(function (el) {
      el.classList.add('visible');
    });
  });
})();

(function () {
  var form = document.getElementById('inquiry-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var successMsg = document.getElementById('inquiry-success');
      var errorMsg = document.getElementById('inquiry-error');
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          if (res.ok) {
            form.reset();
            successMsg.classList.remove('hidden');
            errorMsg.classList.add('hidden');
          } else {
            errorMsg.classList.remove('hidden');
            successMsg.classList.add('hidden');
          }
        })
        .catch(function () {
          errorMsg.classList.remove('hidden');
          successMsg.classList.add('hidden');
        });
    });
  }
})();
