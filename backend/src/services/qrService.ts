import QRCode from "qrcode";

export const generateQRCode = async (
  productId: number,
  contractAddress: string
): Promise<string> => {
  const verificationUrl = `${process.env.APP_URL || "http://localhost:3000"}/verify/${productId}`;

  const payload = JSON.stringify({
    productId,
    contractAddress,
    verificationUrl,
  });

  const qrBase64 = await QRCode.toDataURL(payload);
  return qrBase64;
};