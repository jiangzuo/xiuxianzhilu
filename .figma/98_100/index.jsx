import React from 'react';

import styles from './index.module.scss';

const Component = () => {
  return (
    <div className={styles.frame}>
      <div className={styles.fed807Be9D5A42FeAb9E}>
        <p className={styles.text}>导入修为</p>
        <p className={styles.text4}>
          <span className={styles.text2}>
            将导出的修为粘贴到下方输入框进行导入，
          </span>
          <span className={styles.text3}>
            注意导入将会覆盖现有修炼数据，无法撤回！
          </span>
        </p>
        <div className={styles.rectangle3}>
          <p className={styles.text5}>请在此处粘贴传承密文...</p>
        </div>
        <div className={styles.autoWrapper}>
          <div className={styles.a8Df5164F394149E0936}>
            <p className={styles.text6}>取消</p>
          </div>
          <div className={styles.a8Be98360E3474AdeB46}>
            <p className={styles.text6}>确认</p>
          </div>
        </div>
      </div>
      <div className={styles.fed807Be9D5A42FeAb9E2}>
        <p className={styles.text}>确认覆盖现有修为数据吗？</p>
        <div className={styles.autoWrapper2}>
          <div className={styles.a8Df5164F394149E0936}>
            <p className={styles.text6}>取消</p>
          </div>
          <div className={styles.a8Be98360E3474AdeB46}>
            <p className={styles.text6}>确认</p>
          </div>
        </div>
      </div>
      <div className={styles.content}>
        <p className={styles.bodyText}>导出成功，修为数据已更新</p>
      </div>
      <div className={styles.notification}>
        <p className={styles.bodyText2}>
          抱歉导入出现异常，请检查导入粘贴数据是否和导出数据一致
        </p>
      </div>
    </div>
  );
}

export default Component;
