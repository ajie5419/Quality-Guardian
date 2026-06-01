import { computed, ref } from 'vue';

import { message } from 'ant-design-vue';
import QRCode from 'qrcode';

import { useQrBaseUrl } from '#/views/qms/shared/composables/useQrBaseUrl';

interface UseInspectionRequestEntryActionsOptions {
  handleApiError: (error: unknown, action?: string) => void;
}

export function useInspectionRequestEntryActions({
  handleApiError,
}: UseInspectionRequestEntryActionsOptions) {
  const {
    baseUrl: qrBaseUrl,
    loadBaseUrl,
    saveBaseUrl,
    buildEntryUrl,
  } = useQrBaseUrl();
  const requestEntryOpen = ref(false);
  const incomingRequestEntryQr = ref('');
  const requestEntryQr = ref('');
  const qrBaseInput = ref('');
  const qrBaseSaving = ref(false);

  function buildRequestUrl(
    params: Record<string, string>,
    path = '/qms/inspection/requests',
  ) {
    void qrBaseUrl.value;
    return buildEntryUrl(path, params);
  }

  async function makeQr(url: string) {
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 180,
    });
  }

  const requestEntryUrl = computed(() =>
    buildRequestUrl({ entry: 'submit' }, '/qms/inspection/requests/entry'),
  );
  const incomingRequestEntryUrl = computed(() =>
    buildRequestUrl(
      { entry: 'incoming' },
      '/qms/inspection/requests/incoming-entry',
    ),
  );

  function openRequestEntry() {
    requestEntryOpen.value = true;
  }

  function openPublicEntryPage() {
    window.open(requestEntryUrl.value, '_blank', 'noopener,noreferrer');
  }

  async function copyRequestEntryUrl() {
    await navigator.clipboard.writeText(requestEntryUrl.value);
    message.success('报检入口链接已复制');
  }

  async function saveQrBaseUrl(value: string) {
    qrBaseSaving.value = true;
    try {
      await saveBaseUrl(value);
      qrBaseInput.value = qrBaseUrl.value;
      const [requestQr, incomingQr] = await Promise.all([
        makeQr(requestEntryUrl.value),
        makeQr(incomingRequestEntryUrl.value),
      ]);
      requestEntryQr.value = requestQr;
      incomingRequestEntryQr.value = incomingQr;
      message.success('二维码地址已保存');
    } catch (error) {
      handleApiError(error, '保存二维码地址');
    } finally {
      qrBaseSaving.value = false;
    }
  }

  async function loadRequestEntryConfig() {
    await loadBaseUrl();
    qrBaseInput.value = qrBaseUrl.value;
    const [requestQr, incomingQr] = await Promise.all([
      makeQr(requestEntryUrl.value),
      makeQr(incomingRequestEntryUrl.value),
    ]);
    requestEntryQr.value = requestQr;
    incomingRequestEntryQr.value = incomingQr;
  }

  return {
    buildRequestUrl,
    copyRequestEntryUrl,
    incomingRequestEntryQr,
    incomingRequestEntryUrl,
    loadRequestEntryConfig,
    makeQr,
    openPublicEntryPage,
    openRequestEntry,
    qrBaseInput,
    qrBaseSaving,
    requestEntryOpen,
    requestEntryQr,
    requestEntryUrl,
    saveQrBaseUrl,
  };
}
