import React from 'react';

// Giả lập hook useLanguage
const t = (key: string, _params?: any) => key;

export const FixtureComponent: React.FC = () => {
  // Lệnh gọi giả trong comment đơn 1:
  // t('fixture.fake_comment_single_1')

  const title = "Fixture Title"; // t('fixture.fake_comment_single_2')

  /* Lệnh gọi giả trong block comment 1:
   * t('fixture.fake_comment_block_1')
   */

  /*
    t('fixture.fake_comment_block_2')
  */

  // DUY NHẤT 1 LỆNH GỌI THẬT HỢP LỆ TRONG AST:
  return (
    <div className="fixture-box">
      <h1>{t('fixture.real_key')}</h1>
      <p>{title}</p>
    </div>
  );
};
