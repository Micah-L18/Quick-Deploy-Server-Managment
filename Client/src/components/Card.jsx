import React from 'react';
import styles from './Card.module.css';

const Card = ({ children, title, actions, footer, className = '' }) => {
  return (
    <div className={`${styles.card} ${className}`}>
      {(title || actions) && (
        <div className={styles.cardHeader}>
          {title && <h3 className={styles.cardTitle}>{title}</h3>}
          {actions && <div>{actions}</div>}
        </div>
      )}
      <div className={styles.cardBody}>{children}</div>
      {footer && <div className={styles.cardFooter}>{footer}</div>}
    </div>
  );
};

export default Card;
