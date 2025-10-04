const protectForm = document.getElementById('protect-form');
const protectFileInput = document.getElementById('protect-file');
const protectPasswordInput = document.getElementById('protect-password');
const protectPasswordConfirmInput = document.getElementById(
  'protect-password-confirm'
);
const protectMessage = document.getElementById('protect-message');

const unlockForm = document.getElementById('unlock-form');
const unlockFileInput = document.getElementById('unlock-file');
const unlockPasswordInput = document.getElementById('unlock-password');
const unlockMessage = document.getElementById('unlock-message');

function showMessage(target, message, type = 'info') {
  target.textContent = message;
  target.classList.remove('error', 'success');
  if (type === 'error') {
    target.classList.add('error');
  }
  if (type === 'success') {
    target.classList.add('success');
  }
}

function readFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reader.result;
        if (!(result instanceof ArrayBuffer)) {
          throw new Error('ファイルの読み込み結果が不正です。');
        }
        resolve(new Uint8Array(result));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました。'));
    reader.readAsArrayBuffer(file);
  });
}

async function loadPdf(bytes, options) {
  try {
    return await PDFLib.PDFDocument.load(bytes, options);
  } catch (error) {
    if (options?.password && error?.message?.includes('Input document to `PDFDocument.load` is encrypted')) {
      return PDFLib.PDFDocument.load(bytes, {
        ...options,
        ignoreEncryption: true,
      });
    }
    throw error;
  }
}

function createDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  requestAnimationFrame(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
}

function withSuffix(name, suffix) {
  const index = name.lastIndexOf('.');
  if (index === -1) {
    return `${name}${suffix}`;
  }
  return `${name.slice(0, index)}${suffix}${name.slice(index)}`;
}

function setLoadingState(form, isLoading) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = isLoading;
  button.dataset.originalText ||= button.textContent;
  button.textContent = isLoading ? '処理中…' : button.dataset.originalText;
}

protectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(protectMessage, '');

  const file = protectFileInput.files[0];
  const password = protectPasswordInput.value.trim();
  const passwordConfirm = protectPasswordConfirmInput.value.trim();

  if (!file) {
    showMessage(protectMessage, 'PDF ファイルを選択してください。', 'error');
    return;
  }

  if (!password) {
    showMessage(protectMessage, 'パスワードを入力してください。', 'error');
    return;
  }

  if (password !== passwordConfirm) {
    showMessage(protectMessage, '確認用パスワードが一致しません。', 'error');
    return;
  }

  try {
    setLoadingState(protectForm, true);
    const fileBytes = await readFileAsUint8Array(file);
    const pdfDoc = await PDFLib.PDFDocument.load(fileBytes, {
      ignoreEncryption: false,
    });

    pdfDoc.encrypt({
      ownerPassword: password,
      userPassword: password,
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
    });

    const pdfBytes = await pdfDoc.save();
    const downloadName = withSuffix(file.name, '-protected');
    createDownload(pdfBytes, downloadName);
    showMessage(protectMessage, `${downloadName} をダウンロードしました。`, 'success');
    protectForm.reset();
  } catch (error) {
    console.error(error);
    const message =
      error?.message?.includes('encrypted')
        ? 'すでにパスワード保護された PDF です。解除してから再度お試しください。'
        : 'パスワードの付与に失敗しました。PDF の内容をご確認ください。';
    showMessage(protectMessage, message, 'error');
  } finally {
    setLoadingState(protectForm, false);
  }
});

unlockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(unlockMessage, '');

  const file = unlockFileInput.files[0];
  const password = unlockPasswordInput.value.trim();

  if (!file) {
    showMessage(unlockMessage, 'PDF ファイルを選択してください。', 'error');
    return;
  }

  if (!password) {
    showMessage(unlockMessage, '現在設定されているパスワードを入力してください。', 'error');
    return;
  }

  try {
    setLoadingState(unlockForm, true);
    const fileBytes = await readFileAsUint8Array(file);
    const pdfDoc = await loadPdf(fileBytes, { password, ignoreEncryption: false });

    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    copiedPages.forEach((page) => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    const downloadName = withSuffix(file.name, '-unlocked');
    createDownload(pdfBytes, downloadName);
    showMessage(unlockMessage, `${downloadName} をダウンロードしました。`, 'success');
    unlockForm.reset();
  } catch (error) {
    console.error(error);
    const message = error?.message?.includes('Invalid password')
      ? 'パスワードが正しいか確認してください。'
      : 'パスワードの解除に失敗しました。PDF が破損していないか確認してください。';
    showMessage(unlockMessage, message, 'error');
  } finally {
    setLoadingState(unlockForm, false);
  }
});
