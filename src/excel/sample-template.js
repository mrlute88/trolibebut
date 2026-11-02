/**
 * Sample Excel CSV Template Generator for Teachers (K-12: Lớp 1 - 12)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VnEduSampleTemplate = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function getSampleCSVContent() {
    const BOM = '\uFEFF';
    const rows = [
      'STT,Mã học sinh,Họ và tên,Khối lớp,Môn học,Xếp loại/Mức đạt,Điểm số,Điểm mạnh,Nội dung cần rèn luyện,Mức độ tiến bộ,Nhận xét mẫu',
      '1,HS001,Nguyễn Văn An,10,Toán,T,9.5,Tư duy logic nhạy bén giải toán nhanh,,Tiến bộ vượt bậc,Nắm vững kiến thức toán học tính toán nhanh chính xác và có tư duy sáng tạo.',
      '2,HS002,Trần Thị Bình,8,Ngữ văn,K,7.5,Cảm thụ văn học tốt hành văn mạch lạc,Cần mở rộng dẫn chứng thực tế,Có ý thức học tập,Đọc hiểu văn bản tốt nắm chắc phương pháp làm bài hành văn trôi chảy.',
      '3,HS003,Lê Hoàng Cường,6,Khoa học tự nhiên,H,6.0,Nắm được kiến thức cơ bản,Cần rèn thêm kỹ năng xử lý số liệu,Hiểu bài,Hiểu được các khái niệm và hiện tượng cơ bản hoàn thành tốt bài tập.',
      '4,HS004,Phạm Thị Dung,11,Giáo dục thể chất,Đ,,Thể lực dẻo dai tích cực tập luyện,,Tham gia nhiệt tình,Kỹ thuật động tác chuẩn xác nhanh nhẹn tinh thần đồng đội cao.',
      '5,HS005,Hoàng Văn Em,4,Tiếng Việt,C,,Chăm chỉ,Cần rèn thêm đọc to và viết đúng chính tả,Có cố gắng,Tốc độ đọc còn chậm cần rèn đọc thêm mỗi ngày và luyện viết chữ đều hơn.'
    ];
    return BOM + rows.join('\r\n');
  }

  function downloadSampleFile() {
    const content = getSampleCSVContent();
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'mau_nhan_xet_vnedu_lop1_den_12.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return {
    getSampleCSVContent,
    downloadSampleFile
  };
});
